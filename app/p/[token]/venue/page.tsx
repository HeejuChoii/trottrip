import Link from "next/link";
import { notFound } from "next/navigation";
import { getParentData } from "../data";
import { BottomBar } from "@/components/ParentHome";
import { gateForSeat } from "@/lib/planner";
import type { PlaceCategory } from "@/lib/types";

const FAC: { cat: PlaceCategory; label: string }[] = [
  { cat: "elevator", label: "엘리베이터" }, { cat: "toilet", label: "화장실" }, { cat: "rest", label: "쉼터" },
  { cat: "locker", label: "물품 보관" }, { cat: "info_desk", label: "안내소" }, { cat: "gate", label: "입구" },
];

/** 부모님 화면용 짧은 설명: 괄호 속 메모를 빼고 첫 마디만, 18자 안쪽 */
function shortDesc(t: string): string {
  const s = t.replace(/\([^)]*\)/g, "").split(/[.。·,]/)[0].trim();
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
}
function firstSentence(t: string): string {
  const s = t.split(/(?<=[.。요])\s/)[0].trim();
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}

// P2 공연장 안내 (F9)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const { trip, concert, places } = d;
  const gate = gateForSeat(trip.seat, concert.gate_map);
  const enter = trip.plan!.items.find((i) => i.type === "enter");
  const enterGate = enter?.place_id ? places.find((p) => p.id === enter.place_id) : undefined;
  const gateText = gate ?? enterGate?.name ?? null;

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 일정으로</Link></div>
      <h1 className="h">공연장 안내</h1>
      <p className="hello">{concert.venue_name}</p>
      <div className="seat">
        <div className="s1">내 자리</div>
        <div className="s2">{trip.seat || "좌석 정보 없음"}</div>
        <div className="s3">{gateText ? `${gateText}로 들어가세요` : "입구는 공지가 나오면 업데이트돼요"}</div>
      </div>
      {concert.zone_image_url && (
        <div className="card" style={{ padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={concert.zone_image_url} alt={`${concert.venue_name} 구역도`} style={{ width: "100%", borderRadius: 10, display: "block" }} />
        </div>
      )}
      {concert.official_map_url && <a className="bigbtn line" href={concert.official_map_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 18 }}>공식 좌석 배치도 보기</a>}
      {concert.notice_text && (
        <details className="card" style={{ fontSize: 17, lineHeight: 1.5 }}>
          <summary style={{ cursor: "pointer" }}><b>공지</b> · {firstSentence(concert.notice_text)} <span style={{ color: "var(--deep)", fontWeight: 700 }}>더 보기</span></summary>
          <p style={{ margin: "8px 0 0" }}>{concert.notice_text}</p>
        </details>
      )}
      <div className="fac">
        {FAC.map(({ cat, label }) => {
          const list = places.filter((p) => p.category === cat).sort((a, b) => (a.walk_min_from_venue ?? 99) - (b.walk_min_from_venue ?? 99));
          if (!list.length) return null;
          const p = list[0];
          return (
            <Link key={cat} className="fa" href={`/p/${token}/map?place=${encodeURIComponent(p.id)}`} style={{ textDecoration: "none", color: "inherit" }}>
              {label}<small>{shortDesc(p.description_ko || p.name)}</small>
            </Link>
          );
        })}
      </div>
      {!places.length && <p className="note">이 공연은 공연장 시설 정보를 준비 중이에요. 현장 안내소에 물어보세요.</p>}
      <p className="note">공식 자료를 바탕으로 한 안내예요. 당일 현장 안내를 우선해 주세요.</p>
      <BottomBar token={token} />
    </main>
  );
}
