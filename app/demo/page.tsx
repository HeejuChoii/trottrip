import Link from "next/link";
import Brand from "@/components/Brand";
import { getOrCreateDemoTrip } from "@/lib/demo";
import { fmtDateKo } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "시연 · 트롯트립", robots: { index: false, follow: false } };

// 발표 시연용 고정 시나리오 모음. ?fresh=1 이면 새로 만든다.
export default async function Page({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  const { fresh } = await searchParams;
  let trip;
  let err = "";
  try { trip = await getOrCreateDemoTrip(fresh === "1"); } catch (e) { err = e instanceof Error ? e.message : "시연 일정을 만들지 못했어요"; }
  if (!trip) return <main className="shell"><Brand /><p className="err">{err}</p></main>;
  const p = `/p/${trip.parent_token}`;
  const d = "2026-12-25";
  const links: [string, string, string][] = [
    ["자녀 · 완성된 일정·공유", `/k/${trip.kid_token}`, "걸음 수, 왜 여기?, AI가 이렇게 짰어요, 체크리스트, 티켓"],
    ["자녀 · 진행 상황", `/k/${trip.kid_token}/status`, "완료 시각, 일정 변경, 질문"],
    ["부모님 · 공연 전 안내장 표지", p, "하루 한눈에, 걸음 수, 챙기실 것"],
    ["부모님 · 공연 날 12:00 (점심 전)", `${p}?date=${d}&now=12:00`, "지금 할 일"],
    ["부모님 · 공연 날 14:30 (굿즈)", `${p}?date=${d}&now=14:30`, "굿즈 → 일정 바꾸기"],
    ["부모님 · 물어보기", `${p}/ask?date=${d}&now=15:30`, "\"공연 1시간 남았는데 어디 가야 해?\""],
    ["부모님 · 내 티켓", `${p}/ticket`, "좌석·게이트·귀가 버스"],
    ["부모님 · 공연 끝 20:00 (귀가)", `${p}?date=${d}&now=20:00`, "귀가 안내 → 버스에 탔어요 → 만족도"],
  ];
  return (
    <main className="shell">
      <div className="top"><Brand /><span className="tag pu">시연</span></div>
      <h1 className="h" style={{ fontSize: 22 }}>시연 시나리오</h1>
      <p className="lead">무릎이 편치 않은 어머니가 대구에서 친구 두 분과 팬 모임 버스로 박서진 공연({fmtDateKo(d)})에 가세요. 굿즈는 꼭 사고 싶어 하세요.</p>
      {trip.plan?.fallback_reason && <p className="note" style={{ textAlign: "left" }}>※ {trip.plan.fallback_reason}</p>}
      {links.map(([t, href, sub]) => (
        <Link key={href} href={href} className="card" style={{ textDecoration: "none", color: "inherit" }}>
          <b style={{ fontSize: 16 }}>{t}</b><br /><small style={{ color: "var(--sub)" }}>{sub}</small>
        </Link>
      ))}
      <p className="fine">시연 일정은 지표에서 빠져요. <Link href="/demo?fresh=1">새 시연 일정 만들기</Link> · <Link href="/">처음 화면</Link></p>
    </main>
  );
}
