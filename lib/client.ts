"use client";
// 클라이언트 공용 헬퍼

export async function postJSON<T = unknown>(url: string, data: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "잠시 후 다시 시도해 주세요");
  return json as T;
}

function safeGet(store: "local" | "session", k: string): string | null {
  try { return (store === "local" ? localStorage : sessionStorage).getItem(k); } catch { return null; }
}
function safeSet(store: "local" | "session", k: string, v: string) {
  try { (store === "local" ? localStorage : sessionStorage).setItem(k, v); } catch { /* 저장 불가 환경 */ }
}
export const ls = { get: (k: string) => safeGet("local", k), set: (k: string, v: string) => safeSet("local", k, v) };
export const ss = { get: (k: string) => safeGet("session", k), set: (k: string, v: string) => safeSet("session", k, v) };

/** 유입 경로: 첫 방문 때 ?src= 저장 (F1) */
export function captureSrc(): string {
  const existing = ls.get("tt_src");
  if (existing !== null) return existing;
  const src = new URLSearchParams(location.search).get("src")?.slice(0, 40) ?? "";
  ls.set("tt_src", src || "direct");
  return src || "direct";
}

export function clientId(): string {
  let id = ls.get("tt_cid");
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set("tt_cid", id); }
  return id;
}

/** 데모·리허설용 시각 덮어쓰기: ?now=14:05&date=2026-12-25 (세션 동안 유지) */
export function nowOverride(): { now: string | null; date: string | null } {
  const q = new URLSearchParams(location.search);
  const n = q.get("now");
  const d = q.get("date");
  if (n) ss.set("tt_now", n);
  if (d) ss.set("tt_date", d);
  return { now: n ?? ss.get("tt_now"), date: d ?? ss.get("tt_date") };
}

/** 현재 KST(분, 날짜) — 덮어쓰기 반영. 덮어쓴 시각은 그 시점부터 실제로 흐른다 */
const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
export function clientNow(): { date: string; min: number; overridden: boolean } {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  let date = k.toISOString().slice(0, 10);
  let min = k.getUTCHours() * 60 + k.getUTCMinutes();
  const o = nowOverride();
  let overridden = false;
  if (o.now && /^\d{1,2}:\d{2}$/.test(o.now)) {
    const [h, m] = o.now.split(":").map(Number);
    min = h * 60 + m + Math.floor((performance.now() - startedAt) / 60000);
    overridden = true;
  }
  if (o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) { date = o.date; overridden = true; }
  return { date, min, overridden };
}

export function hhmmNow(): string {
  const { min } = clientNow();
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function track(type: string, token?: string, item_id?: string, payload?: Record<string, unknown>) {
  return postJSON("/api/events", { type, token, item_id, payload }).catch(() => undefined);
}
