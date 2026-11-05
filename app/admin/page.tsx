import { isAdmin } from "@/lib/admin";
import { ensureSeedConcerts, listConcerts, listPosters, placeCounts, storageHealth, storageMode, supabaseKeyKind } from "@/lib/db";
import AdminPosters from "@/components/admin/AdminPosters";
import AdminCommunity from "@/components/admin/AdminCommunity";
import { computeMetrics } from "@/lib/metrics";
import { listUsage } from "@/lib/db";
import { budgetUsd } from "@/lib/usage";
import { aiEnabled, MODEL } from "@/lib/ai";
import { concertripConfigured } from "@/lib/concertrip";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminConcerts from "@/components/admin/AdminConcerts";
import AdminEval from "@/components/admin/AdminEval";
import AdminPilgrim from "@/components/admin/AdminPilgrim";
import DeckCard from "@/components/admin/DeckCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "운영자 · 트롯트립", robots: { index: false, follow: false } };

// A1 운영자 화면 (F15)
export default async function Page() {
  if (!(await isAdmin())) return <AdminLogin configured={!!process.env.ADMIN_PASSWORD} />;
  // 새 시드 공연(가수 8명)을 등록하고, 실제 일정으로 바뀐 가상 공연은 숨긴다
  await ensureSeedConcerts().catch(() => undefined);
  const [m, concerts, counts, usage, health] = await Promise.all([computeMetrics(), listConcerts(false), placeCounts(), listUsage().catch(() => []), storageHealth()]);
  const keyKind = supabaseKeyKind();
  const spent = usage.reduce((a, r) => a + Number(r.cost_usd), 0);
  const byKind = Object.entries(usage.reduce<Record<string, { n: number; usd: number }>>((acc, r) => {
    const k = `${r.kind} · ${r.model}`; (acc[k] ??= { n: 0, usd: 0 }); acc[k].n++; acc[k].usd += Number(r.cost_usd); return acc;
  }, {}));
  return (
    <main className="admin">
      <div className="top"><span className="brand">트롯<i>트립</i> 운영자</span><AdminLogin logout /></div>
      <p className="note" style={{ textAlign: "left" }}>
        저장소: <b>{storageMode() === "supabase" ? `Supabase (키: ${keyKind === "service" ? "service_role" : keyKind === "secret" ? "secret" : keyKind})` : "로컬 파일(.data) — 배포 전 Supabase 설정 필요"}</b> · 공연 {health.concerts}개 ·
        AI: <b>{aiEnabled() ? MODEL : "꺼짐(규칙 기반)"}</b> ·
        콘서트립 API: <b>{concertripConfigured() ? "연결됨" : "미설정(JSON 업로드 사용)"}</b> ·
        카카오: <b>{process.env.NEXT_PUBLIC_KAKAO_JS_KEY ? "설정됨" : "미설정(링크 복사로 대체)"}</b>
      </p>

      {storageMode() === "supabase" && (keyKind === "anon" || keyKind === "publishable" || health.error || health.concerts === 0) && (
        <div className="card" style={{ borderColor: "var(--pinkD)", fontSize: 14, lineHeight: 1.7 }}>
          <b className="err">DB 연결 확인 필요</b><br />
          {keyKind === "anon" || keyKind === "publishable"
            ? <>Vercel의 <code>SUPABASE_SERVICE_KEY</code>에 <b>{keyKind === "anon" ? "anon" : "publishable"} 키</b>가 들어 있어요. 이 키로는 읽기가 0건으로 나오고 저장이 안 돼요. Supabase → Project Settings → API Keys에서 <b>service_role</b>(또는 <code>sb_secret_…</code>) 키로 바꾸고 Redeploy 해 주세요.</>
            : health.error ? <>DB 오류: {health.error}</>
            : <>공연이 0개예요. SQL Editor에서 <code>supabase/seed.sql</code>을 실행했는지, Vercel의 <code>SUPABASE_URL</code>이 그 프로젝트 주소인지 확인해 주세요. (키 종류: {keyKind})</>}
        </div>
      )}
      <div className="card" style={{ fontSize: 14, lineHeight: 1.7 }}>
        <b>Claude API 누적 사용량</b> ${spent.toFixed(2)} / 예산 ${budgetUsd()} ({Math.round((spent / budgetUsd()) * 100)}%)
        {spent >= budgetUsd() && <span className="err"> · 예산 소진: 새 일정은 규칙 기반으로 만들어요</span>}<br />
        <small>{byKind.map(([k, v]) => `${k}: ${v.n}회 $${v.usd.toFixed(3)}`).join(" · ") || "아직 호출 없음"}</small><br />
        <small>Croche 챗봇 비용은 Croche Studio에서 확인하세요.</small>
      </div>

      <DeckCard d={m.deck} />

      <h2 className="h" style={{ fontSize: 20 }}>해커톤 지표</h2>
      <div className="tblwrap"><table>
        <thead><tr><th>지표</th><th>정의</th><th>현재</th><th>목표</th></tr></thead>
        <tbody>{m.rows.map((r) => <tr key={r.label}><td><b>{r.label}</b></td><td>{r.def}</td><td className="n">{r.value}</td><td className="n">{r.target}</td></tr>)}</tbody>
      </table></div>
      <p className="note" style={{ textAlign: "left" }}>공유 버튼: 카카오톡 {m.shares.kakao} · 이메일 {m.shares.email} · 링크 복사 {m.shares.copy}</p>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div>
          <h2 className="h" style={{ fontSize: 18 }}>유입 경로별</h2>
          <div className="tblwrap"><table>
            <thead><tr><th>src</th><th>시작</th><th>일정</th><th>열람</th><th>결제 의향</th></tr></thead>
            <tbody>{m.bySrc.map((r) => <tr key={r.src}><td>{r.src}</td><td className="n">{r.starts}</td><td className="n">{r.trips}</td><td className="n">{r.opens}</td><td className="n">{r.intents}</td></tr>)}
              {!m.bySrc.length && <tr><td colSpan={5}>아직 데이터가 없어요</td></tr>}</tbody>
          </table></div>
        </div>
        <div>
          <h2 className="h" style={{ fontSize: 18 }}>일자별 (KST)</h2>
          <div className="tblwrap"><table>
            <thead><tr><th>날짜</th><th>시작</th><th>일정</th><th>첫 열람</th><th>첫 완료</th></tr></thead>
            <tbody>{m.byDay.map((r) => <tr key={r.day}><td>{r.day}</td><td className="n">{r.starts}</td><td className="n">{r.trips}</td><td className="n">{r.opens}</td><td className="n">{r.actives}</td></tr>)}
              {!m.byDay.length && <tr><td colSpan={5}>아직 데이터가 없어요</td></tr>}</tbody>
          </table></div>
        </div>
      </div>

      <AdminCommunity />
      <AdminPosters concerts={concerts.filter((c) => c.active).map((c) => ({ id: c.id, title: c.title, date: c.date, artist: c.artist_display, ticket_url: c.ticket_url ?? null }))} initial={await listPosters()} />
      <AdminPilgrim venues={[...new Set(concerts.filter((c) => c.active).map((c) => c.venue_name))]} />
      <AdminEval />

      <h2 className="h" style={{ fontSize: 20 }}>공연 · 콘서트립 장소</h2>
      <AdminConcerts concerts={concerts} counts={counts} />
    </main>
  );
}
