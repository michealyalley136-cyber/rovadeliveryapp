import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LoginPage from "../../app/login/page";
import { HeroSlideshow } from "../../components/hero-slideshow";

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

  it("shows a non-operational account sign-in and links to available services", () => {
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain("Welcome back.");
    expect(markup).toContain("account sign-in is not available yet");
    expect(markup).toContain("<fieldset disabled");
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('href="/application-status"');
    expect(markup).toContain('href="/admin"');
    expect(markup).toContain('href="/apply"');
    expect(markup).toContain('href="#password-help"');
    expect(markup).toContain('id="password-help"');
    expect(markup).toContain("New to ROVA? Apply now");
    expect(markup).not.toContain('href="/customer"');
    expect(markup).not.toContain('href="/driver"');
  });
});
