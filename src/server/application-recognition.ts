import "server-only";
import { createHmac } from "node:crypto";
import { errors, jwtVerify, SignJWT } from "jose";

export const recognitionCookieName = "rova_application_recognition";
export const recognitionMaxAge = 90 * 24 * 60 * 60;
const audience = "urn:rova:application-recognition";
const tokenType = "rova-application-recognition+jwt";

function recognitionConfiguration() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters for application recognition.");
  const local = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  const environment = process.env.ROVA_AUTH_ENVIRONMENT ?? (local ? "local" : undefined);
  if ((environment !== "local" && environment !== "staging" && environment !== "production") || (!local && environment === "local")) {
    throw new Error("ROVA_AUTH_ENVIRONMENT must identify this deployment as staging or production.");
  }
  return {
    key: createHmac("sha256", secret).update("rova/application-recognition/v1").digest(),
    issuer: `urn:rova:application-recognition:${environment}`,
  };
}

export async function createApplicationRecognition() {
  const { key, issuer } = recognitionConfiguration();
  return new SignJWT({ kind: "application-recognition" })
    .setProtectedHeader({ alg: "HS256", typ: tokenType })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${recognitionMaxAge}s`)
    .sign(key);
}

export async function isApplicationRecognized(token: string | undefined) {
  if (!token) return false;
  const { key, issuer } = recognitionConfiguration();
  try {
    const { payload, protectedHeader } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer,
      audience,
      requiredClaims: ["iss", "aud", "iat", "exp", "kind"],
      maxTokenAge: `${recognitionMaxAge}s`,
    });
    return protectedHeader.typ === tokenType && payload.kind === "application-recognition";
  } catch (error) {
    if (error instanceof errors.JOSEError) return false;
    throw error;
  }
}
