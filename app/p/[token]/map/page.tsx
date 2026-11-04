import { notFound } from "next/navigation";
import { getParentData } from "../data";
import ParentMap from "@/components/ParentMap";

const MAP_CATS = new Set(["restaurant", "cafe", "rest", "goods", "photo", "sight", "toilet", "elevator", "gate", "bus_stop", "info_desk", "locker"]);

// P5 지도 (F8)
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ place?: string }> }) {
  const { token } = await params;
  const { place } = await searchParams;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const inPlan = new Set(d.trip.plan!.items.map((i) => i.place_id).filter(Boolean));
  // 오늘 쓰는 장소: 일정에 들어간 장소 + 시설(화장실·엘리베이터·입구·버스 등)
  const pins = d.places.filter((p) => p.lat != null && p.lng != null && (inPlan.has(p.id) || ["toilet", "elevator", "gate", "bus_stop", "info_desk"].includes(p.category)) && MAP_CATS.has(p.category));
  return (
    <ParentMap
      token={token}
      items={d.trip.plan!.items}
      done={d.done}
      concertDate={d.concert.date}
      pins={pins}
      focus={place ?? null}
      venue={{ name: d.concert.venue_name, lat: d.concert.venue_lat, lng: d.concert.venue_lng }}
      kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""}
      kidLabel={d.trip.kid_label}
      pilgrim={!!d.concert.pilgrim}
      extraPins={d.trip.plan!.pins ?? []}
    />
  );
}
