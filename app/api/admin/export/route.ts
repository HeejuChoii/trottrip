// GET /api/admin/export?kind=summary|trips — 발표·제출용 CSV (엑셀에서 한글이 깨지지 않게 BOM 포함)
import { isAdmin } from "@/lib/admin";
import { listAllEvents, listTripsLite } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";

function csv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("로그인이 필요해요", { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "summary";
  const stamp = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace(/[-:T]/g, "");
  let body: string;
  if (kind === "trips") {
    const [trips, events] = await Promise.all([listTripsLite(), listAllEvents()]);
    const by = (id: string, t: string) => events.filter((e) => e.trip_id === id && e.type === t);
    body = csv([
      ["생성(UTC)", "유입", "공연", "부모님 열람", "완료 수", "질문 수", "결제 의향", "걱정 1문항", "만족도", "덜 걷게"],
      ...trips.map((t) => [
        t.created_at, t.src || "direct", t.concert_id ?? "직접 입력",
        by(t.id, "parent_open").length ? "Y" : "", by(t.id, "done").length, by(t.id, "chat").length,
        String(by(t.id, "intent")[0]?.payload?.answer ?? ""), String(by(t.id, "survey")[0]?.payload?.answer ?? ""),
        String(by(t.id, "feedback")[0]?.payload?.answer ?? ""), by(t.id, "less_walk").length,
      ]),
    ]);
  } else {
    const m = await computeMetrics();
    const d = m.deck;
    body = csv([
      ["지표", "값", "정의", "목표"],
      ...m.rows.map((r) => [r.label, r.value, r.def, r.target]),
      ["부모님 링크 열람률", `${d.open_rate}%`, "열람 / 생성 일정", ""],
      ["부모님 활성률", `${d.active_rate}%`, "완료 1회 이상 / 생성 일정", ""],
      ["물어보기 사용률", `${d.chat_rate}%`, "질문 1회 이상 / 생성 일정", ""],
      ["평가 세트 통과율", d.eval ? `${d.eval.rate}% (${d.eval.passed}/${d.eval.total})` : "-", "대표 시나리오 10개 규칙 검사", ""],
      ["일정 1건당 API 비용", `${d.cost.per_trip_krw}원 ($${d.cost.per_trip_usd})`, "Claude API 누적 비용 / 생성 일정", ""],
      ["덜 걷게 바꾸기", `${d.less_walk.count}회 (평균 ${d.less_walk.avg_before}→${d.less_walk.avg_after}보)`, "", ""],
      ...d.worries.map((w) => [`걱정: ${w.answer}`, w.n, "공유 직후 1문항", ""]),
      ...d.chat_top.map((c, i) => [`질문 Top${i + 1}: ${c.q}`, c.n, "", ""]),
      ...d.feedback.map((f) => [`만족도: ${f.answer}`, f.n, "귀가 후 1탭", ""]),
    ]);
  }
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="trottrip-${kind}-${stamp}.csv"` },
  });
}
