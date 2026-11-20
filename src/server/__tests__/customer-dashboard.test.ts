import { describe, expect, it } from "vitest";
import { customerServices, greeting } from "../../config/customer-services";

describe("customer dashboard", () => {
  it("uses the appropriate greeting throughout the day", () => {
    expect(greeting(0)).toBe("Good morning");
    expect(greeting(11)).toBe("Good morning");
    expect(greeting(12)).toBe("Good afternoon");
    expect(greeting(17)).toBe("Good afternoon");
    expect(greeting(18)).toBe("Good evening");
  });

  it("offers only ride and taxi as demo bookings", () => {
    expect(customerServices).toHaveLength(6);
    expect(customerServices.filter((service) => service.demo).map((service) => service.id)).toEqual(["RIDE", "TAXI"]);
    expect(new Set(customerServices.map((service) => service.image)).size).toBe(6);
  });
});
