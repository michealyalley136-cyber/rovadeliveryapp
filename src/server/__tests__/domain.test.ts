import { describe, expect, it } from "vitest";
import { allowedTransitions, assertTripTransition } from "../../lib/domain";
import { operatorActivationDecision } from "../compliance";
import { estimateFare, ledgerBreakdown } from "../pricing";

describe("trip state rules", () => {
  it("allows only defined forward transitions", () => {
    expect(allowedTransitions.SEARCHING).toContain("RIDER_ASSIGNED");
    expect(allowedTransitions.TRIP_COMPLETED).toBeUndefined();
    expect(allowedTransitions.TRIP_STARTED).not.toContain("RIDER_ASSIGNED");
    expect(() => assertTripTransition("RIDER_ARRIVED", "TRIP_STARTED")).not.toThrow();
    expect(() => assertTripTransition("TRIP_STARTED", "RIDER_ASSIGNED")).toThrow("Trip cannot move");
  });
});

describe("operator activation compliance", () => {
  it("requires every required document and training check to be valid", () => {
    expect(operatorActivationDecision("OPERATOR").allowed).toBe(true);
    const blocked = operatorActivationDecision("OPERATOR", { licence: "EXPIRED" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("licence");
  });

  it("does not activate non-operator roles", () => {
    expect(operatorActivationDecision("CUSTOMER").allowed).toBe(false);
  });
});

describe("demo pricing", () => {
  it("returns a positive fare in pesewas for configured services", () => {
    expect(estimateFare("RIDE")).toBeGreaterThan(0);
    expect(estimateFare("TAXI")).toBeGreaterThan(estimateFare("RIDE"));
  });

  it("keeps the immutable demo ledger split equal to the fare", () => {
    const farePesewas = estimateFare("RIDE");
    const breakdown = ledgerBreakdown(farePesewas);
    expect(breakdown.operatorEarningPesewas + breakdown.platformFeePesewas).toBe(farePesewas);
    expect(() => ledgerBreakdown(-1)).toThrow("non-negative integer");
  });
});
