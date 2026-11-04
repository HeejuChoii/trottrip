// Vercel(서비스) ↔ Render(챗봇 서버) 요청 형식과 서명.
// Vercel이 부모님 토큰으로 안내장을 확인한 뒤, 필요한 자료를 담아 HMAC으로 서명해 보낸다.
// 이 서버는 서명이 맞는 요청의 trip_id만 사용자 ID로 믿는다.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface AgentPlace {
  id: string;
  name: string;
  category: string;
  walk_min: number | null;
  description: string;
  tags: string[];
  fan_type: string;
}

export interface AgentItem {
  id: string;
  start: string;
  end: string;
  type: string;
  title: string;
  place_id: string | null;
  parent_text: string;
  done: boolean;
}

export interface ChatRequest {
  trip_id: string; // UUID
  message_id: string; // 같은 질문 재전송 구분용
  q: string;
  now: string; // HH:MM (KST)
  parent_honorific: string;
  kid_honorific: string;
  kid_phone: string;
  concert: { title: string; venue: string; date: string; start_time: string; est_end_time: string | null; notice: string };
  seat: string;
  gate: string | null;
  info_desk: string | null;
  items: AgentItem[];
  places: AgentPlace[];
}

/** 챗봇이 답과 함께 띄우는 버튼. 누르면 Vercel 화면으로 이동한다(챗봇이 화면을 직접 바꾸지 않음) */
export type ChatAction =
  | { type: "schedule"; item_id: string; label: string } // 일정에서 보기 → /p/{token}?item=
  | { type: "map"; place_id: string; label: string }; // 지도에서 길찾기 → /p/{token}/map?place=&route=1

export interface ChatResponse {
  text: string;
  needs_check: boolean;
  place_id: string | null;
  actions: ChatAction[];
}

export const SIG_HEADER = "x-trottrip-signature";
export const TS_HEADER = "x-trottrip-timestamp";
const MAX_SKEW_MS = 5 * 60 * 1000;

export function sign(secret: string, ts: string, body: string): string {
  return createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
}

export function verify(secret: string, ts: string | undefined, sig: string | undefined, body: string, now = Date.now()): boolean {
  if (!secret || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > MAX_SKEW_MS) return false;
  const expected = Buffer.from(sign(secret, ts, body));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isTripId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
