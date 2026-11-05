import Link from "next/link";
import { notFound } from "next/navigation";
import { getParentData } from "../data";
import { BottomBar } from "@/components/ParentHome";
import { gateForSeat } from "@/lib/planner";
import { EMPTY_TICKET } from "@/lib/schemas";
import { absMin, addDays, fmtDateKo, fmtDateLongKo, fmtTimeKo } from "@/lib/time";
import { RouteMapBox } from "@/components/RouteMap";
import { routeStops } from "@/lib/stops";
import { tipsFor } from "@/lib/text";
import type { PlaceCategory } from "@/lib/types";

const PICKUP: Record<string, string> = { mobile: "휴대폰(모바일 티켓)으로 들어가요", onsite: "공연장에서 티켓을 받아요(현장 수령)", paper: "종이 티켓을 꼭 챙기세요", "": "" };

const FAC: { cat: PlaceCategory; label: string }[] = [
  { cat: "elevator", label: "엘리베이터" }, { cat: "toilet", label: "화장실" }, { cat: "rest", label: "쉼터" },
  { cat: "locker", label: "물품 보관" }, { cat: "info_desk", label: "안내소" }, { cat: "gate", label: "입구" },
];

/** 부모님 화면용 짧은 설명: 괄호 속 메모를 빼고 첫 마디만, 18자 안쪽 */
function shortDesc(t: string, max = 18): string {
  const s = t.replace(/\([^)]*\)/g, "").split(/[.。,]|\s·\s/)[0].trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function firstSentence(t: string): string {
  const s = t.split(/(?<=[.。요])\s/)[0].trim();
  return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}

// P2 공연장 · 내 티켓 (F9 + F20을 한 화면으로)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const { trip, concert, places } = d;
  const gate = gateForSeat(trip.seat, concert.gate_map);
  const enter = trip.plan!.items.find((i) => i.type === "enter");
  const enterGate = enter?.place_id ? places.find((p) => p.id === enter.place_id) : undefined;
  const gateText = gate ?? enterGate?.name ?? null;
  const t = { ...EMPTY_TICKET, ...(trip.ticket ?? {}) };
  const tips = tipsFor(concert.tips, trip.transport.mode);
  const ret = trip.plan!.items.find((i) => i.type === "return");
  const retPlace = ret?.place_id ? places.find((p) => p.id === ret.place_id) : undefined;
  const mapLink = (id?: string | null) => (id ? `/p/${token}/map?place=${encodeURIComponent(id)}&route=1` : null);

  // 팬덤 스팟 여행: 공연장 대신 여행 전체 일정(지도 + 시간순 일정, 자녀 화면과 같은 흐름을 큰 글씨로)
  if (concert.pilgrim) {
    const items = [...trip.plan!.items].sort((x, y) => absMin(x) - absMin(y));
    const byId = new Map(places.map((p) => [p.id, p]));
    const multi = items.some((i) => (i.day ?? 1) > 1);
    return (
      <main className="shell pv">
        <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 안내장으로</Link></div>
        <h1 className="h">{concert.artist_display} 팬덤 여행 일정</h1>
        <p className="hello">{fmtDateLongKo(concert.date)} · {concert.city}</p>
        <RouteMapBox stops={routeStops(d)} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""} height="42vh" />
        <div className="tl">
          {items.map((it, idx) => {
            const p = it.place_id ? byId.get(it.place_id) : undefined;
            const day = it.day ?? 1;
            const head = multi && (idx === 0 || (items[idx - 1].day ?? 1) !== day);
            const fan = !!p && !!p.fan_type && p.fan_type !== "none";
            const box = (
              <>
                <b>{it.title.replace(/\s*\(.*\)$/, "")}</b>
                <small>{[it.walk_min != null ? `걸어서 ${it.walk_min}분` : null, `${it.start}~${it.end}`].filter(Boolean).join(" · ")}</small>
                {it.parent_text && <small>{it.parent_text}</small>}
              </>
            );
            return (
              <div key={it.id} style={{ display: "contents" }}>
                {head && <div className="lab" style={{ margin: "12px 0 2px", fontSize: 16, color: "var(--pinkD)" }}>{day === 1 ? "첫째 날" : "둘째 날"} · {fmtDateKo(addDays(concert.date, day - 1))}</div>}
                <div className={`ti ${fan ? "pk" : ""}`}>
                  <div className="t">{it.start}</div>
                  <div className="dot" />
                  {p ? <Link className="box" href={`/p/${token}/map?place=${encodeURIComponent(p.id)}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>{box}</Link> : <div className="box">{box}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="note">장소를 누르면 지도에서 볼 수 있어요. 영업시간·휴무일을 반영해 짰어요.</p>
        <BottomBar token={token} pilgrim current="venue" />
      </main>
    );
  }

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 안내장으로</Link></div>
      <h1 className="h">공연장 · 내 티켓</h1>
      <p className="hello">{concert.title}<br />{fmtDateLongKo(concert.date)} {fmtTimeKo(concert.start_time)} · {concert.venue_name}</p>
      <div className="seat">
        <div className="s1">내 자리</div>
        <div className="s2">{trip.seat || "좌석 정보 없음"}</div>
        <div className="s3">{gateText ? `${gateText}로 들어가세요` : "입구는 공지가 나오면 업데이트돼요"}</div>
        {enter && <div style={{ fontSize: 17, marginTop: 6 }}>입장 {fmtTimeKo(enter.start)}부터</div>}
      </div>
      {enterGate && <Link className="actbtn" href={mapLink(enterGate.id)!}>🧭 입구까지 길찾기</Link>}
      <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
        <b>🎫 티켓</b><br />
        {PICKUP[t.pickup] || "티켓 받는 방법은 자녀분께 확인해 주세요"}
        {t.vendor && <><br />예매처: {t.vendor}</>}
        {t.id_check && <><br /><b>신분증을 꼭 챙기세요.</b>{t.booker_name ? ` 예매자: ${t.booker_name}` : ""}</>}
      </div>
      {ret?.title.startsWith("숙소") && (
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>🏨 {ret.title}</b><br />공연이 끝나면 체크인하세요 · {fmtTimeKo(ret.start)}쯤
          {ret.link && <><br /><a href={ret.link.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: "var(--deep)" }}>{ret.link.label}</a></>}
        </div>
      )}
      {ret && !ret.title.startsWith("숙소") && (
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>🚌 {ret.title}</b><br />
          {fmtTimeKo(ret.start)} · {retPlace?.name ?? (trip.transport.return_place || "출발 장소 확인 필요")}
          {(t.bus_car || t.bus_seat) && <><br /><b>{[t.bus_car, t.bus_seat && `${t.bus_seat} 좌석`].filter(Boolean).join(" · ")}</b></>}
          {t.note && <><br />{t.note}</>}
          {retPlace && <><br /><Link href={mapLink(retPlace.id)!} style={{ fontWeight: 700, color: "var(--deep)" }}>🧭 타는 곳 길찾기</Link></>}
        </div>
      )}
      {concert.zone_image_url && (
        <div className="card" style={{ padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={concert.zone_image_url} alt={`${concert.venue_name} 구역도`} style={{ width: "100%", borderRadius: 10, display: "block" }} />
        </div>
      )}
      {concert.official_map_url && <a className="bigbtn line" href={concert.official_map_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 18 }}>공식 좌석 배치도 보기</a>}
      {concert.notice_text && (
        <details className="card" style={{ fontSize: 17, lineHeight: 1.5 }}>
          <summary style={{ cursor: "pointer" }}><b>공지</b><span className="sum-more"> · {firstSentence(concert.notice_text)} <span style={{ color: "var(--deep)", fontWeight: 700 }}>더 보기</span></span></summary>
          <p style={{ margin: "8px 0 0" }}>{concert.notice_text}</p>
        </details>
      )}
      {tips.length > 0 && (
        <details className="card" style={{ fontSize: 17, lineHeight: 1.55 }}>
          <summary style={{ cursor: "pointer" }}><b>💡 공연장 꿀팁</b><span className="sum-more"> · {firstSentence(tips[0])} <span style={{ color: "var(--deep)", fontWeight: 700 }}>더 보기</span></span></summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>{tips.map((t) => <li key={t}>{t}</li>)}</ul>
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
      {concert.ticket_url && <a className="actbtn" href={concert.ticket_url} target="_blank" rel="noopener noreferrer">📄 예매처 공지 보기</a>}
      <p className="note">공식 자료를 바탕으로 한 안내예요. 당일 현장 안내를 우선해 주세요.</p>
      <BottomBar token={token} current="venue" />
    </main>
  );
}
