import { isAdmin } from "@/lib/admin";
import { listConcerts, placeCounts, storageMode } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { aiEnabled, MODEL } from "@/lib/ai";
import { concertripConfigured } from "@/lib/concertrip";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminConcerts from "@/components/admin/AdminConcerts";

export const dynamic = "force-dynamic";
export const metadata = { title: "운영자 · 트롯트립", robots: { index: false, follow: false } };

// A1 운영자 화면 (F15)
export default async function Page() {
  if (!(await isAdmin())) return <AdminLogin configured={!!process.env.ADMIN_PASSWORD} />;
  const [m, concerts, counts] = await Promise.all([computeMetrics(), listConcerts(false), placeCounts()]);
  return (
    <main className="admin">
      <div className="top"><span className="brand">트롯<i>트립</i> 운영자</span><AdminLogin logout /></div>
      <p className="note" style={{ textAlign: "left" }}>
        저장소: <b>{storageMode() === "supabase" ? "Supabase" : "로컬 파일(.data) — 배포 전 Supabase 설정 필요"}</b> ·
        AI: <b>{aiEnabled() ? MODEL : "꺼짐(규칙 기반)"}</b> ·
        콘서트립 API: <b>{concertripConfigured() ? "연결됨" : "미설정(JSON 업로드 사용)"}</b> ·
        카카오: <b>{process.env.NEXT_PUBLIC_KAKAO_JS_KEY ? "설정됨" : "미설정(링크 복사로 대체)"}</b>
      </p>

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

      <h2 className="h" style={{ fontSize: 20 }}>공연 · 콘서트립 장소</h2>
      <AdminConcerts concerts={concerts} counts={counts} />
    </main>
  );
}
