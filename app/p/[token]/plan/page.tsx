import { notFound } from "next/navigation";
import { getParentData } from "../data";
import Itinerary from "../Itinerary";

// 공연 날 '일정·지도' 탭: 동선 지도 + 전체 일정 (팬덤 여행은 '여행 일정' 탭에 같은 화면)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  return <Itinerary d={d} token={token} current="map" />;
}
