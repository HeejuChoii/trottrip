// GET /api/og?t={parentToken} — 링크 미리보기·카카오 공유 이미지 (공연명 + 날짜 + 트롯트립 로고)
import { ImageResponse } from "next/og";
import { getConcert, getTripBy } from "@/lib/db";
import { concertView } from "@/lib/trip";
import { fmtDateKo, fmtTimeKo } from "@/lib/time";
import { estimateSteps } from "@/lib/steps";
import { getPlaces } from "@/lib/db";

export const runtime = "nodejs";

async function loadFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    // UA 없이 요청하면 Google Fonts가 TTF를 준다(satori는 woff2 미지원). 필요한 글자만 받는다.
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(4000) })).text();
    const url = /src: url\((.+?)\) format\('(opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(4000) })).arrayBuffer();
  } catch { return null; }
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const trip = t ? await getTripBy("parent_token", t) : null;
  let title = "부모님의 최애를 만나러 가는 길";
  let sub = "여행까지 선물하세요";
  let color = "#087E72";
  if (trip) {
    const c = concertView(trip, trip.concert_id ? await getConcert(trip.concert_id) : null);
    title = c.title;
    sub = `${fmtDateKo(c.date)} ${fmtTimeKo(c.start_time)} · ${c.venue_name}`;
    color = c.color || color;
  }
  let foot = "공연 날 안내장 · 앱 설치 없이 바로 보세요";
  if (trip?.plan) {
    const places = trip.concert_id ? await getPlaces(trip.concert_id) : [];
    foot = `예상 약 ${estimateSteps(trip.plan, places, trip.parent_profile).steps.toLocaleString("ko-KR")}보 · 앱 설치 없이 바로 보세요`;
  }
  const text = `${title}${sub}${foot}트롯트립`;
  const [bold, reg] = await Promise.all([loadFont(text, 900), loadFont(text, 500)]);
  const fonts = [
    ...(bold ? [{ name: "Noto", data: bold, weight: 900 as const, style: "normal" as const }] : []),
    ...(reg ? [{ name: "Noto", data: reg, weight: 500 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#F2F4F6", padding: 64, fontFamily: "Noto" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 900, color: "#14C1AD" }}>트롯<span style={{ color: "#FF7461" }}>트립</span></div>
        <div style={{ display: "flex", flexDirection: "column", background: color, color: "#fff", borderRadius: 36, padding: "44px 48px" }}>
          <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 36, fontWeight: 500, marginTop: 18, opacity: 0.92 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "#23313B" }}>{foot}</div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined, headers: { "cache-control": "public, max-age=3600" } },
  );
}
