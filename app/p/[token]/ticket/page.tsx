import Link from "next/link";
import { notFound } from "next/navigation";
import { getParentData } from "../data";
import { BottomBar } from "@/components/ParentHome";
import { gateForSeat } from "@/lib/planner";
import { EMPTY_TICKET } from "@/lib/schemas";
import { fmtDateLongKo, fmtTimeKo } from "@/lib/time";

const PICKUP: Record<string, string> = { mobile: "휴대폰(모바일 티켓)으로 들어가요", onsite: "공연장에서 티켓을 받아요(현장 수령)", paper: "종이 티켓을 꼭 챙기세요", "": "" };

// F20 내 티켓·예약 정보 카드
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const { trip, concert, places } = d;
  const t = { ...EMPTY_TICKET, ...(trip.ticket ?? {}) };
  const items = trip.plan!.items;
  const enter = items.find((i) => i.type === "enter");
  const ret = items.find((i) => i.type === "return");
  const gatePlace = enter?.place_id ? places.find((p) => p.id === enter.place_id) : undefined;
  const gate = gateForSeat(trip.seat, concert.gate_map) ?? gatePlace?.name ?? null;
  const retPlace = ret?.place_id ? places.find((p) => p.id === ret.place_id) : undefined;
  const goodsItem = items.find((i) => i.type === "goods" && i.place_id);
  const goodsPlace = goodsItem ? places.find((p) => p.id === goodsItem.place_id) : undefined;
  const mapLink = (id?: string | null) => (id ? `/p/${token}/map?place=${encodeURIComponent(id)}&route=1` : null);

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 일정으로</Link></div>
      <h1 className="h">내 티켓</h1>
      <p className="hello">{concert.title}<br />{fmtDateLongKo(concert.date)} {fmtTimeKo(concert.start_time)} · {concert.venue_name}</p>

      <div className="seat">
        <div className="s1">내 자리</div>
        <div className="s2">{trip.seat || "좌석 정보 없음"}</div>
        <div className="s3">{gate ? `${gate}로 들어가세요` : "입구는 공지가 나오면 업데이트돼요"}</div>
        {enter && <div style={{ fontSize: 17, marginTop: 6 }}>입장 {fmtTimeKo(enter.start)}부터</div>}
      </div>
      {gatePlace && <Link className="actbtn" href={mapLink(gatePlace.id)!}>🧭 입구까지 길찾기</Link>}

      <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
        <b>🎫 티켓</b><br />
        {PICKUP[t.pickup] || "티켓 받는 방법은 자녀분께 확인해 주세요"}
        {t.vendor && <><br />예매처: {t.vendor}</>}
        {t.id_check && <><br /><b>신분증을 꼭 챙기세요.</b>{t.booker_name ? ` 예매자: ${t.booker_name}` : ""}</>}
      </div>
      {concert.ticket_url && <a className="actbtn" href={concert.ticket_url} target="_blank" rel="noopener noreferrer">📄 예매처 공지 보기</a>}

      {ret && (
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>🚌 {ret.title}</b><br />
          {fmtTimeKo(ret.start)} · {retPlace?.name ?? (trip.transport.return_place || "출발 장소 확인 필요")}
          {(t.bus_car || t.bus_seat) && <><br /><b>{[t.bus_car, t.bus_seat && `${t.bus_seat} 좌석`].filter(Boolean).join(" · ")}</b></>}
          {t.note && <><br />{t.note}</>}
        </div>
      )}
      {retPlace && <Link className="actbtn" href={mapLink(retPlace.id)!}>🧭 버스 타는 곳 길찾기</Link>}

      {goodsPlace && (
        <>
          <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
            <b>🛍 굿즈 부스</b><br />{goodsPlace.name} · {goodsPlace.description_ko}
            {goodsItem && <><br />{fmtTimeKo(goodsItem.start)}에 가시면 돼요</>}
          </div>
          <Link className="actbtn" href={mapLink(goodsPlace.id)!}>🧭 굿즈 부스 길찾기</Link>
        </>
      )}
      <p className="note">공식 자료를 바탕으로 한 안내예요. 당일 현장 안내를 우선해 주세요.</p>
      <BottomBar token={token} pilgrim={!!d.concert.pilgrim} />
    </main>
  );
}
