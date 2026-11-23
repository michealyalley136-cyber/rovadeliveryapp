import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/server/auth", () => ({ getSession: mocks.getSession }));

import { CustomerBooking } from "@/components/customer-booking";
import { CustomerDashboard } from "@/components/customer-dashboard";
import { CustomerMapPlanner } from "@/components/customer-map-planner";
import MotorcyclePage from "@/app/customer/motorcycle/page";
import CabPage from "@/app/customer/cab/page";
import { routeInputKey, shouldAutocomplete } from "@/lib/maps/planner-state";

describe("customer service-first booking flow", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ id: "customer-test", role: "CUSTOMER", name: "Test Customer" });
  });

  it("keeps the full planner off the main customer dashboard", () => {
    const markup = renderToStaticMarkup(<CustomerDashboard
      user={{ name: "Test Customer" }}
      rotation={{ intervalSeconds: 60, artworks: [] }}
    />);
    expect(markup).not.toContain("Plan your journey");
    expect(markup).not.toContain("Pickup address or landmark");
    expect(markup).not.toContain("Get road route");
    expect(markup).toContain("What can we help you with?");
  });

  it.each([
    ["RIDE", "MOTORCYCLE"],
    ["TAXI", "DRIVING"],
  ] as const)("renders %s booking with a fixed %s profile", (service, profile) => {
    const markup = renderToStaticMarkup(<CustomerBooking service={service} />);
    expect(markup).toContain(`data-booking-service="${service}"`);
    expect(markup).toContain(`data-routing-profile="${profile}"`);
    expect(markup).toContain('href="/customer"');
    expect(markup).toContain("Back to Services");
  });

  it("shows no service toggle or Ghana road-map heading in the planner", () => {
    const markup = renderToStaticMarkup(<CustomerMapPlanner service="RIDE" />);
    expect(markup).toContain("Plan your journey");
    expect(markup).toContain("Motorcycle service");
    expect(markup).toContain("Pickup address or landmark");
    expect(markup).toContain("Destination address or landmark");
    expect(markup).not.toContain("GHANA ROAD MAP");
    expect(markup).not.toContain('aria-label="Journey service"');
  });

  it("binds motorcycle and taxi routes through their trusted server pages", async () => {
    const motorcycle = renderToStaticMarkup(await MotorcyclePage());
    const taxi = renderToStaticMarkup(await CabPage());
    expect(motorcycle).toContain('data-booking-service="RIDE"');
    expect(motorcycle).toContain('data-routing-profile="MOTORCYCLE"');
    expect(taxi).toContain('data-booking-service="TAXI"');
    expect(taxi).toContain('data-routing-profile="DRIVING"');
  });

  it("does not autocomplete a selected address and invalidates stale route keys", () => {
    expect(shouldAutocomplete("Kotoka International Airport, Accra", "Kotoka International Airport, Accra")).toBe(false);
    expect(shouldAutocomplete("Kotoka", "Kotoka International Airport, Accra")).toBe(true);

    const pickup = { longitude: -0.171, latitude: 5.605 };
    const destination = { longitude: -0.166, latitude: 5.558 };
    const motorcycle = routeInputKey("RIDE", pickup, destination);
    expect(motorcycle).not.toBe(routeInputKey("RIDE", { ...pickup, longitude: -0.172 }, destination));
    expect(motorcycle).not.toBe(routeInputKey("TAXI", pickup, destination));
    expect(routeInputKey("RIDE", null, destination)).toBeNull();
  });
});
