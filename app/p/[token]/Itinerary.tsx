import Link from "next/link";
import { BottomBar } from "@/components/ParentHome";
import { FocusStop, RouteMapBox } from "@/components/RouteMap";
import { routeStops } from "@/lib/stops";
import { absMin, addDays, fmtDateKo, fmtDateLongKo, fmtTimeKo } from "@/lib/time";
import type { getParentData } from "./data";

type D = Extract<NonNullable<Awaited<ReturnType<typeof getParentData>>>, { expired: false }>;

/** 부모님용 전체 일정: 위에는 동선 지도, 아래는 시간순 일정(큰 글씨). 팬덤 여행은 '여행 일정' 탭, 공연 날은 '일정·지도' 탭 */
export default function Itinerary({ d, token, current }: { d: D; token: string; current: "venue" | "map" }) {
  const { trip, concert, places } = d;
  const items = [...trip.plan!.items].sort((x, y) => absMin(x) - absMin(y));
  const byId = new Map(places.map((p) => [p.id, p]));
  const multi = items.some((i) => (i.day ?? 1) > 1);
  const stops = routeStops(d);
  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${token}`} style={{ fontSize: 18 }}>← 안내장으로</Link></div>
      <h1 className="h">{concert.pilgrim ? `${concert.artist_display} 팬덤 여행 일정` : "공연 날 일정"}</h1>
      <p className="hello">{concert.pilgrim ? `${fmtDateLongKo(concert.date)} · ${concert.city}` : `${fmtDateLongKo(concert.date)} ${fmtTimeKo(concert.start_time)} · ${concert.venue_name}`}</p>
      <RouteMapBox stops={stops} kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""} height="42vh" />
      <div className="tl">
        {items.map((it, idx) => {
          const p = it.place_id ? byId.get(it.place_id) : undefined;
          const day = it.day ?? 1;
          const head = multi && (idx === 0 || (items[idx - 1].day ?? 1) !== day);
          // 핑크: 공연·입장·굿즈·포토존, 가수가 다녀간 곳
          const pink = ["show", "enter", "goods", "photo"].includes(it.type) || (!!p && !!p.fan_type && p.fan_type !== "none");
          const box = (
            <>
              <b>{it.title.replace(/\s*\(.*\)$/, "")}</b>
              <small>{[it.walk_min != null ? `걸어서 ${it.walk_min}분` : null, `${it.start}~${it.end}`].filter(Boolean).join(" · ")}</small>
              {it.parent_text && <small>{it.parent_text}</small>}
            </>
          );
          // 지도 핀: 장소 좌표, 없으면 같은 시각의 공연장·역·숙소 핀
          const ll = p?.lat != null && p?.lng != null ? { lat: p.lat, lng: p.lng, name: p.name } : stops.find((x) => x.time === it.start && x.day === day) ?? null;
          return (
            <div key={it.id} style={{ display: "contents" }}>
              {head && <div className="lab" style={{ margin: "12px 0 2px", fontSize: 16, color: "var(--pinkD)" }}>{day === 1 ? "첫째 날" : "둘째 날"} · {fmtDateKo(addDays(concert.date, day - 1))}</div>}
              <div className={`ti ${pink ? "pk" : ""}`}>
                <div className="t">{it.start}</div>
                <div className="dot" />
                {ll ? <FocusStop className="box" lat={ll.lat} lng={ll.lng} name={ll.name}>{box}</FocusStop> : <div className="box">{box}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="note">장소를 누르면 위 지도에서 그 자리를 크게 보여 드려요.{concert.pilgrim ? " 영업시간·휴무일을 반영해 짰어요." : " 공연장 안 화장실·입구 같은 시설은 길찾기 화면에서 볼 수 있어요."}</p>
      <BottomBar token={token} pilgrim={!!concert.pilgrim} current={current} />
    </main>
  );
}
