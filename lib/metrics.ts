// 운영 지표 (PRD 2장, F15)
import "server-only";
import { listAllEvents, listTripsLite } from "./db.ts";

function kstDay(iso: string) {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface Metrics {
  rows: { label: string; def: string; value: string; target: string }[];
  bySrc: { src: string; starts: number; trips: number; opens: number; intents: number }[];
  byDay: { day: string; starts: number; trips: number; opens: number; actives: number }[];
  shares: { kakao: number; email: number; copy: number };
}

export async function computeMetrics(): Promise<Metrics> {
  const [trips, events] = await Promise.all([listTripsLite(), listAllEvents()]);
  const tripSrc = new Map(trips.map((t) => [t.id, t.src || "direct"]));
  const starters = new Map<string, { src: string; day: string }>();
  const tripsWith = (type: string, pred: (p: Record<string, unknown>) => boolean = () => true) =>
    new Set(events.filter((e) => e.type === type && e.trip_id && pred(e.payload ?? {})).map((e) => e.trip_id!));

  for (const e of events) {
    if (e.type !== "start") continue;
    const cid = String(e.payload?.cid ?? "") || `anon-${e.created_at}`;
    if (!starters.has(cid)) starters.set(cid, { src: String(e.payload?.src || "direct"), day: kstDay(e.created_at) });
  }
  const opened = tripsWith("parent_open");
  const active = tripsWith("done");
  const chatted = tripsWith("chat");
  const intentYes = tripsWith("intent", (p) => p.answer === "yes");
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "-");

  const rows = [
    { label: "가입 자녀", def: "일정 생성을 시작한 자녀(기기 기준)", value: String(starters.size), target: "300명" },
    { label: "생성 일정", def: "AI 일정 생성 완료", value: String(trips.length), target: "150건" },
    { label: "부모님 링크 열람", def: "공유 링크 첫 열람", value: String(opened.size), target: "100건" },
    { label: "부모님 활성", def: "완료 버튼 1회 이상", value: String(active.size), target: "30건" },
    { label: "물어보기 사용", def: "챗봇 질문 1회 이상", value: String(chatted.size), target: "30건" },
    { label: "결제 의향", def: "\"출시되면 결제할게요\" / 일정 생성", value: `${intentYes.size}건 (${pct(intentYes.size, trips.length)})`, target: "20%" },
    { label: "협조한 팬 모임", def: "일정을 공유해 준 지역방·밴드 (유입 경로로 확인 후 직접 집계)", value: "직접 기록", target: "5곳" },
  ];

  const srcs = new Set<string>([...tripSrc.values(), ...[...starters.values()].map((s) => s.src)]);
  const bySrc = [...srcs].map((src) => ({
    src,
    starts: [...starters.values()].filter((s) => s.src === src).length,
    trips: trips.filter((t) => (t.src || "direct") === src).length,
    opens: [...opened].filter((id) => tripSrc.get(id) === src).length,
    intents: [...intentYes].filter((id) => tripSrc.get(id) === src).length,
  })).sort((a, b) => b.trips - a.trips || b.starts - a.starts);

  const days = new Set<string>([...trips.map((t) => kstDay(t.created_at)), ...[...starters.values()].map((s) => s.day)]);
  const firstOf = (type: string) => {
    const m = new Map<string, string>();
    for (const e of events) if (e.type === type && e.trip_id && !m.has(e.trip_id)) m.set(e.trip_id, kstDay(e.created_at));
    return [...m.values()];
  };
  const openDays = firstOf("parent_open");
  const activeDays = firstOf("done");
  for (const d of [...openDays, ...activeDays]) days.add(d);
  const byDay = [...days].sort().reverse().map((day) => ({
    day,
    starts: [...starters.values()].filter((s) => s.day === day).length,
    trips: trips.filter((t) => kstDay(t.created_at) === day).length,
    opens: openDays.filter((d) => d === day).length,
    actives: activeDays.filter((d) => d === day).length,
  }));

  const count = (t: string) => events.filter((e) => e.type === t).length;
  return { rows, bySrc, byDay, shares: { kakao: count("share_kakao"), email: count("share_email"), copy: count("share_copy") } };
}
