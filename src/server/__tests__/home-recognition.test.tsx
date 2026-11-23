import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, admin: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }),
}));
vi.mock("@/server/auth", () => ({ getAdminSession: async () => state.admin ? { id: "staff" } : null }));

import HomePage from "../../app/page";
import { createApplicationRecognition } from "../application-recognition";

describe("homepage recognition", () => {
  beforeEach(() => {
    state.token = undefined;
    state.admin = false;
    vi.stubEnv("AUTH_SECRET", "test-only-recognition-secret-at-least-32-characters");
    vi.stubEnv("ROVA_AUTH_ENVIRONMENT", "local");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("renders Login only for a valid marker or an authenticated administrator", async () => {
    expect(renderToStaticMarkup(await HomePage())).not.toContain('href="/login"');
    state.token = await createApplicationRecognition();
    expect(renderToStaticMarkup(await HomePage())).toContain('href="/login"');
    state.token += "tampered";
    expect(renderToStaticMarkup(await HomePage())).not.toContain('href="/login"');
    state.admin = true;
    expect(renderToStaticMarkup(await HomePage())).toContain('href="/login"');
  });
});
