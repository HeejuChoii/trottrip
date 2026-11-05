// 팬 라운지 카카오 로그인: 카카오 OAuth(REST 키) → 닉네임만 받아 서명된 쿠키에 저장한다(이메일·전화번호는 받지 않음)
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export interface FanUser { id: string; name: string }
const COOKIE = "tt_fan";
const STATE = "tt_fan_state";

function secret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.AGENT_SHARED_SECRET || "trottrip-dev-secret";
}
function sign(v: string) { return createHmac("sha256", secret()).update(v).digest("base64url"); }

export async function getFanUser(): Promise<FanUser | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as FanUser; } catch { return null; }
}

export async function setFanUser(u: FanUser) {
  const body = Buffer.from(JSON.stringify(u)).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
}
export async function clearFanUser() { (await cookies()).delete(COOKIE); }

export function kakaoLoginReady(): boolean { return !!process.env.KAKAO_REST_API_KEY; }

/** 카카오 로그인 화면 주소. redirectUri는 카카오 디벨로퍼스 [카카오 로그인 → Redirect URI]에 등록해야 한다 */
export async function kakaoAuthorizeUrl(redirectUri: string, next: string): Promise<string> {
  const state = randomBytes(12).toString("base64url");
  (await cookies()).set(STATE, `${state}|${next}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  const qs = new URLSearchParams({ client_id: process.env.KAKAO_REST_API_KEY!, redirect_uri: redirectUri, response_type: "code", state });
  return `https://kauth.kakao.com/oauth/authorize?${qs}`;
}

/** 콜백: state 확인 → 토큰 교환 → 닉네임 */
export async function kakaoFinish(code: string, state: string, redirectUri: string): Promise<{ user: FanUser; next: string }> {
  const jar = await cookies();
  const saved = jar.get(STATE)?.value ?? "";
  jar.delete(STATE);
  const [want, next] = saved.split("|");
  if (!want || want !== state) throw new Error("로그인 요청이 만료됐어요. 다시 시도해 주세요");
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.KAKAO_REST_API_KEY!, redirect_uri: redirectUri, code });
  if (process.env.KAKAO_CLIENT_SECRET) form.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const t = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form, cache: "no-store" });
  const tok = await t.json() as { access_token?: string; error_description?: string };
  if (!tok.access_token) throw new Error(`카카오 로그인 실패: ${tok.error_description ?? t.status}`);
  const me = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
  const j = await me.json() as { id?: number; properties?: { nickname?: string }; kakao_account?: { profile?: { nickname?: string } } };
  if (!j.id) throw new Error("카카오 사용자 정보를 받지 못했어요");
  const name = (j.kakao_account?.profile?.nickname || j.properties?.nickname || "트롯팬").slice(0, 20);
  return { user: { id: `kakao:${j.id}`, name }, next: next && next.startsWith("/") ? next : "/fan" };
}
