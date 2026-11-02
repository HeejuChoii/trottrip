// 시간 유틸. 모든 시각은 한국 시간(KST, UTC+9) 기준.

export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function toHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function isHHMM(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test((s || "").trim());
}

/** 현재 KST 날짜(YYYY-MM-DD)와 자정 이후 분 */
export function nowKST(d: Date = new Date()): { date: string; min: number } {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const date = k.toISOString().slice(0, 10);
  return { date, min: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

/** 부모님 링크 유효기간: 공연 다음 날 23:59 KST */
export function expiryFor(concertDate: string): string {
  const base = new Date(`${concertDate}T23:59:00+09:00`);
  if (isNaN(base.getTime())) return new Date(Date.now() + 30 * 86400000).toISOString();
  return new Date(base.getTime() + 86400000).toISOString();
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** "12월 25일(금)" */
export function fmtDateKo(date: string, withDow = true): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  if (isNaN(d.getTime())) return date;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const s = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
  return withDow ? `${s}(${DOW[k.getUTCDay()]})` : s;
}

export function fmtDateLongKo(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  if (isNaN(d.getTime())) return date;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${DOW[k.getUTCDay()]}요일`;
}

/** "오후 3시 20분" — 부모님 화면용 쉬운 시각 */
export function fmtTimeKo(hhmm: string): string {
  const t = toMin(hhmm);
  if (isNaN(t)) return hhmm;
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ap = h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const prefix = h >= 21 ? "밤" : ap;
  return `${prefix} ${h12}시${m ? ` ${m}분` : ""}`;
}

/** "3:30" 짧은 12시간 표기 */
export function fmtShort(hhmm: string): string {
  const t = toMin(hhmm);
  if (isNaN(t)) return hhmm;
  const h = Math.floor(t / 60) % 12 || 12;
  return `${h}:${String(t % 60).padStart(2, "0")}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}
