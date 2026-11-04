// GET /api/og?t={parentToken} — 링크 미리보기·카카오 공유 이미지 (공연명 + 날짜 + 트롯트립 로고)
import { ImageResponse } from "next/og";
import { getConcert, getTripBy } from "@/lib/db";
import { concertView } from "@/lib/trip";
import { fmtDateKo, fmtTimeKo } from "@/lib/time";

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

let logoData: string | null = null;
/** 로고: 배포 환경에선 public 파일이 함수에 안 들어갈 수 있어 같은 사이트 주소로 받아 온다 */
async function logo(origin: string): Promise<string | null> {
  if (logoData) return logoData;
  try {
    const r = await fetch(`${origin}/trottrip-logo-512.png`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    logoData = `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { logoData = null; }
  return logoData;
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const trip = t ? await getTripBy("parent_token", t) : null;
  let kicker = "공연 날 안내장";
  let artist = "";
  let title = "부모님의 최애를 만나러 가는 길";
  let when = "여행까지 선물하세요";
  let where = "";
  if (trip) {
    const c = concertView(trip, trip.concert_id ? await getConcert(trip.concert_id) : null);
    artist = c.artist_display;
    if (c.pilgrim) {
      kicker = "팬덤 스팟 여행 안내장";
      title = `${c.artist_display} 팬덤 스팟 여행`;
      where = c.city;
      when = fmtDateKo(c.date);
    } else {
      title = c.title.replace(/^.*?〈|〉.*$/g, "") || c.title;
      when = `${fmtDateKo(c.date)} ${fmtTimeKo(c.start_time)}`;
      where = c.venue_name;
    }
  }
  const who = trip?.parent_profile.honorific || "부모님";
  const foot = trip ? `${who}께 드리는 하루 · 앱 설치 없이 바로 보세요` : "앱 설치 없이 바로 보세요";
  const text = `${kicker}${artist}${title}${when}${where}${foot}트롯트립`;
  const [bold, reg, img] = await Promise.all([loadFont(text, 900), loadFont(text, 500), logo(new URL(req.url).origin)]);
  const fonts = [
    ...(bold ? [{ name: "Noto", data: bold, weight: 900 as const, style: "normal" as const }] : []),
    ...(reg ? [{ name: "Noto", data: reg, weight: 500 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #14C1AD 0%, #6FDCCB 55%, #FFB3CB 100%)", fontFamily: "Noto", padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", background: "#FFFFFF", borderRadius: 40, padding: "44px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {img ? <img src={img} width={88} height={88} style={{ borderRadius: 22 }} /> : null}
            <div style={{ display: "flex", fontSize: 56, fontWeight: 900, color: "#14C1AD", letterSpacing: -1 }}>트롯<span style={{ color: "#FF5C93" }}>트립</span></div>
            <div style={{ display: "flex", marginLeft: "auto", fontSize: 28, fontWeight: 900, color: "#C2185B", background: "#FFEEF4", borderRadius: 999, padding: "10px 22px" }}>{kicker}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {artist ? <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: "#E8457E" }}>{artist}</div> : null}
            <div style={{ display: "flex", fontSize: 66, fontWeight: 900, color: "#062F2A", lineHeight: 1.15, letterSpacing: -1 }}>{title}</div>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 500, color: "#23313B", marginTop: 14 }}>{[when, where].filter(Boolean).join("  ·  ")}</div>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: "#5B6B73" }}>{foot}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined, headers: { "cache-control": "public, max-age=3600" } },
  );
}
