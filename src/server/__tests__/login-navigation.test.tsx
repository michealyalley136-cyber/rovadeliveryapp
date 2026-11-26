import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "../../app/login/page";
import { HeroSlideshow } from "../../components/hero-slideshow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe("login navigation", () => {
  it("places Login between application status and apply in the homepage navigation", () => {
    const markup = renderToStaticMarkup(<HeroSlideshow showLogin />);
    const status = markup.indexOf('href="/application-status"');
    const login = markup.indexOf('href="/login"');
    const apply = markup.indexOf('href="/apply"');
    expect(status).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(status);
    expect(apply).toBeGreaterThan(login);
    expect(markup).toContain('aria-controls="campaign-navigation"');
  });

  it("hides Login from unrecognized visitors without hiding application links", () => {
    const markup = renderToStaticMarkup(<HeroSlideshow showLogin={false} />);
    expect(markup).not.toContain('href="/login"');
    expect(markup).toContain('href="/application-status"');
    expect(markup).toContain('href="/apply"');
  });

  it("shows verified customer sign-in without turning applications into accounts", () => {
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain("Welcome back.");
    expect(markup).toContain("VERIFIED CUSTOMER ACCESS");
    expect(markup).toContain("application or status reference is not an account credential");
    expect(markup).toContain('type="password"');
    expect(markup).toContain("Sign in");
    expect(markup).toContain('href="/application-status"');
    expect(markup).toContain("Already applied? Check application status");
    expect(markup).toContain("Submitting an application does not activate an account");
    expect(markup).toContain('href="/admin"');
    expect(markup).toContain('href="/apply"');
    expect(markup).toContain('href="/forgot-password"');
    expect(markup).toContain("New to ROVA? Apply now");
    expect(markup).not.toContain('href="/customer"');
    expect(markup).not.toContain('href="/driver"');
  });
});
