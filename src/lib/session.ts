import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "buscadornf_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 horas — app corporativo, sessão mais curta que um app doméstico

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET não configurado no ambiente.");
  }
  return value;
}

function sign(userId: string): string {
  const hmac = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${hmac}`;
}

function verify(token: string): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex === -1) return null;
  const userId = token.slice(0, separatorIndex);
  const providedHmac = token.slice(separatorIndex + 1);
  const expectedHmac = createHmac("sha256", secret()).update(userId).digest("hex");

  const provided = Buffer.from(providedHmac);
  const expected = Buffer.from(expectedHmac);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return userId;
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}
