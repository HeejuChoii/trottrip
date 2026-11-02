import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "tt_admin";

function sig(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHmac("sha256", pw).update("trottrip-admin").digest("hex");
}

export function checkPassword(pw: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const s = sig();
  if (!s) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && c.length === s.length && timingSafeEqual(Buffer.from(c), Buffer.from(s));
}

export async function setAdminCookie() {
  const s = sig();
  if (!s) return;
  (await cookies()).set(COOKIE, s, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearAdminCookie() {
  (await cookies()).delete(COOKIE);
}
