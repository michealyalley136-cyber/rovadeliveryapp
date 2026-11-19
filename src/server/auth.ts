import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { adminRoles, demoUsers, type AdminRole, type AppRole, type DemoUser, permissions } from "@/lib/domain";
import { isDemoMode } from "@/server/demo-store";

const cookieName = "rova_demo_session";
const adminCookieName = "rova_admin_session";

function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set to at least 32 characters.");
    return new TextEncoder().encode("local-development-only-rova-demo-secret");
  }
  return new TextEncoder().encode(secret);
}

export async function createDemoSession(role: AppRole) {
  if (!isDemoMode()) throw new Error("Demo sign-in is disabled.");
  const user = demoUsers[role];
  const token = await new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(signingKey());
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return user;
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function createAdminSession(user: { id: string; role: AdminRole; name: string }) {
  const token = await new SignJWT({ role: user.role, name: user.name, kind: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(signingKey());
  const jar = await cookies();
  jar.set(adminCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(adminCookieName);
}

export async function getAdminSession(): Promise<{ id: string; role: AdminRole; name: string } | null> {
  const token = (await cookies()).get(adminCookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    const role = payload.role;
    if (payload.kind !== "admin" || typeof role !== "string" || !adminRoles.includes(role as AdminRole) || !payload.sub || typeof payload.name !== "string") return null;
    return { id: payload.sub, role: role as AdminRole, name: payload.name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DemoUser | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    const role = payload.role;
    if (typeof role !== "string" || !(role in demoUsers)) return null;
    return { id: payload.sub!, role: role as AppRole, name: demoUsers[role as AppRole].name };
  } catch {
    return null;
  }
}

export async function requireRole(role: AppRole) {
  const session = await getSession();
  if (!session || session.role !== role) return null;
  return session;
}

export function can(role: AppRole, permission: string) {
  return permissions[role].includes(permission);
}
