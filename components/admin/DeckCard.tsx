import type { Deck } from "@/lib/metrics";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 12.5, color: "var(--sub)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "var(--deep)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--sub)" }}>{sub}</div>}
    </div>
  );
}

/** 발표용 지표 카드 (캡처해서 PPT에 그대로 쓰기) */
export default function DeckCard({ d }: { d: Deck }) {
  const totalWorry = d.worries.reduce((a, w) => a + w.n, 0);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="h" style={{ fontSize: 20, margin: 0 }}>발표용 지표</h2>
        <span style={{ display: "flex", gap: 6 }}>
          <a className="mini-btn" href="/api/admin/export?kind=summary" style={{ textDecoration: "none" }}>지표 CSV</a>
          <a className="mini-btn" href="/api/admin/export?kind=trips" style={{ textDecoration: "none" }}>일정별 CSV</a>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <Kpi label="생성 일정" value={`${d.trips}건`} />
        <Kpi label="부모님 링크 열람률" value={`${d.open_rate}%`} />
        <Kpi label="부모님 활성률" value={`${d.active_rate}%`} sub="완료 버튼 1회 이상" />
        <Kpi label="물어보기 사용률" value={`${d.chat_rate}%`} />
        <Kpi label="결제 의향률" value={`${d.intent_rate}%`} sub="정가 3,900원 기준" />
        <Kpi label="평가 세트 통과율" value={d.eval ? `${d.eval.rate}%` : "-"} sub={d.eval ? `${d.eval.passed}/${d.eval.total} · ${new Date(d.eval.at).toLocaleString("ko-KR")}` : "평가 실행을 눌러 주세요"} />
        <Kpi label="일정 1건당 API 비용" value={`약 ${d.cost.per_trip_krw.toLocaleString("ko-KR")}원`} sub={`$${d.cost.per_trip_usd} · 누적 $${d.cost.total_usd}`} />
        <Kpi label="덜 걷게 바꾸기" value={`${d.less_walk.count}회`} sub={d.less_walk.count ? `평균 ${d.less_walk.avg_before.toLocaleString("ko-KR")}보 → ${d.less_walk.avg_after.toLocaleString("ko-KR")}보` : ""} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
        <div className="card" style={{ fontSize: 14, lineHeight: 1.7 }}>
          <b>자녀가 가장 걱정하는 것</b> <small>(공유 직후 1문항, {totalWorry}명)</small>
          {d.worries.length ? d.worries.map((w) => <div key={w.answer}>{w.answer} · {w.n}명 ({Math.round((w.n / totalWorry) * 100)}%)</div>) : <div>아직 응답이 없어요</div>}
        </div>
        <div className="card" style={{ fontSize: 14, lineHeight: 1.7 }}>
          <b>부모님이 많이 물어본 것 Top 5</b>
          {d.chat_top.length ? d.chat_top.map((c, i) => <div key={c.q}>{i + 1}. {c.q} · {c.n}회</div>) : <div>아직 질문이 없어요</div>}
        </div>
        <div className="card" style={{ fontSize: 14, lineHeight: 1.7 }}>
          <b>부모님 만족도</b> <small>(귀가 후 1탭)</small>
          {d.feedback.length ? d.feedback.map((f) => <div key={f.answer}>{f.answer} · {f.n}명</div>) : <div>아직 응답이 없어요</div>}
        </div>
      </div>
    </section>
  );
}
