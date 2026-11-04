// 운영 지표 (PRD 2장, F15)
import "server-only";
import { listAllEvents, listTripsLite, listUsage } from "./db.ts";

function kstDay(iso: string) {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface Metrics {
  rows: { label: string; def: string; value: string; target: string }[];
  bySrc: { src: string; starts: number; trips: number; opens: number; intents: number }[];
  byDay: { day: string; starts: number; trips: number; opens: number; actives: number }[];
  shares: { kakao: number; email: number; copy: number };
  deck: Deck;
}

/** 발표용 지표 (v1.2) */
export interface Deck {
  trips: number;
  open_rate: number; // %
  active_rate: number;
  chat_rate: number;
  intent_rate: number;
  less_walk: { count: number; avg_before: number; avg_after: number };
  chat_top: { q: string; n: number }[];
  eval: { passed: number; total: number; rate: number; at: string } | null;
  cost: { total_usd: number; per_trip_usd: number; per_trip_krw: number; plan_calls: number };
  worries: { answer: string; n: number }[];
  feedback: { answer: string; n: number }[];
}

function topCounts(values: string[], n = 5) {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function computeMetrics(): Promise<Metrics> {
  const [allTrips, allEvents] = await Promise.all([listTripsLite(), listAllEvents()]);
  // 시연(/demo) 일정은 지표에서 뺀다
  const demoIds = new Set(allTrips.filter((t) => t.src === "demo").map((t) => t.id));
  const trips = allTrips.filter((t) => !demoIds.has(t.id));
  const events = allEvents.filter((e) => !e.trip_id || !demoIds.has(e.trip_id));
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

  const usage = await listUsage().catch(() => []);
  const totalUsd = usage.reduce((a, r) => a + Number(r.cost_usd), 0);
  const krw = Number(process.env.USD_KRW ?? 1400);
  const lw = events.filter((e) => e.type === "less_walk");
  const avg = (k: string) => (lw.length ? Math.round(lw.reduce((a, e) => a + Number(e.payload?.[k] ?? 0), 0) / lw.length) : 0);
  const lastEval = events.filter((e) => e.type === "eval").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const FB: Record<string, string> = { good: "좋았어요", ok: "괜찮았어요", hard: "조금 힘들었어요" };
  const deck: Deck = {
    trips: trips.length,
    open_rate: pctOf(opened.size, trips.length),
    active_rate: pctOf(active.size, trips.length),
    chat_rate: pctOf(chatted.size, trips.length),
    intent_rate: pctOf(intentYes.size, trips.length),
    less_walk: { count: lw.length, avg_before: avg("before"), avg_after: avg("after") },
    chat_top: topCounts(events.filter((e) => e.type === "chat").map((e) => String(e.payload?.q ?? "").trim().replace(/[?？.!\s]+$/, ""))).map(([q, n]) => ({ q, n })),
    eval: lastEval ? { passed: Number(lastEval.payload?.passed ?? 0), total: Number(lastEval.payload?.total ?? 0), rate: Number(lastEval.payload?.rate ?? 0), at: lastEval.created_at } : null,
    cost: {
      total_usd: Math.round(totalUsd * 100) / 100,
      per_trip_usd: trips.length ? Math.round((totalUsd / trips.length) * 1000) / 1000 : 0,
      per_trip_krw: trips.length ? Math.round((totalUsd / trips.length) * krw) : 0,
      plan_calls: usage.filter((u) => u.kind === "plan").length,
    },
    worries: topCounts(events.filter((e) => e.type === "survey").map((e) => String(e.payload?.answer ?? "")), 10).map(([answer, n]) => ({ answer, n })),
    feedback: topCounts(events.filter((e) => e.type === "feedback").map((e) => FB[String(e.payload?.answer ?? "")] ?? ""), 5).map(([answer, n]) => ({ answer, n })),
  };
  return { rows, bySrc, byDay, shares: { kakao: count("share_kakao"), email: count("share_email"), copy: count("share_copy") }, deck };
}
