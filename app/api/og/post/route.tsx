// GET /api/og/post?id={글 주소} — 팬 라운지 글 링크 미리보기(카톡·문자): 제목 + 첫 줄을 흐리게 끊어 궁금하게
import { ImageResponse } from "next/og";
import { artistBySlug, findMockPost, mockKey, type FanPost } from "@/lib/community";
import { getFanPost } from "@/lib/db";

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

async function photo(origin: string, slug: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/artists/${slug}.jpg`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    return `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  const post: FanPost | null = !id ? null : mockKey(id) ? findMockPost(id) : await getFanPost(id).catch(() => null);
  const a = post ? artistBySlug(post.artist) : null;
  const color = a?.color ?? "#14C1AD";
  const where = a ? `${a.name} 라운지${a.fandom ? ` · ${a.fandom}` : ""}` : "트롯 수다방";
  // 이모지는 외부 그림 파일을 받아야 그려져서(실패하면 이미지 전체가 깨짐) 뺀다
  const noEmoji = (t: string) => t.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
  const title = post && !post.hidden ? noEmoji(post.title) : "우리 가수 팬들과 덕질 이야기";
  const body = post && !post.hidden ? noEmoji(post.body) : "공연 후기, 팬덤 스팟 여행, 스밍 인증까지";
  // 첫 줄만 또렷하게, 뒤는 흐리게 → "더 보고 싶게"
  const cut = body.length > 30 ? Math.max(body.lastIndexOf(" ", 30), 18) : body.length; // 단어 중간에서 끊지 않는다
  const head = body.slice(0, cut).trim();
  const tail = body.slice(cut, cut + 28).trim();
  const meta = post ? [post.comments ? `댓글 ${post.comments}` : "", post.likes ? `좋아요 ${post.likes}` : "", post.poll ? "투표 진행 중" : ""].filter(Boolean).join("  ·  ") : "";
  const text = `${where}${title}${head}${tail}${meta}트롯트립 팬 라운지이어서 보기→${post?.category ?? ""}${post?.author_name ?? ""}`;
  const [bold, reg, img, logoImg] = await Promise.all([loadFont(text, 900), loadFont(text, 500), a ? photo(u.origin, a.slug) : Promise.resolve(null), logo(u.origin)]);
  const fonts = [
    ...(bold ? [{ name: "Noto", data: bold, weight: 900 as const, style: "normal" as const }] : []),
    ...(reg ? [{ name: "Noto", data: reg, weight: 500 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: color, fontFamily: "Noto", padding: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%", background: "#FFFFFF", borderRadius: 36, padding: "40px 48px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {img ? <img src={img} width={76} height={76} style={{ borderRadius: 999, objectFit: "cover" }} /> : (logoImg ? <img src={logoImg} width={76} height={76} style={{ borderRadius: 999 }} /> : <div style={{ display: "flex", width: 76, height: 76, borderRadius: 999, background: color }} />)}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 900, color: "#111" }}>{where}</div>
              {post ? <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#6B7780" }}>{`${post.category} · ${post.author_name}`}</div> : null}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 900, color: "#111", lineHeight: 1.2, letterSpacing: -1 }}>{title.length > 34 ? `${title.slice(0, 33)}…` : title}</div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: "#23313B", marginTop: 18 }}>{head}</div>
            {tail ? <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: "#C3CBD0", marginTop: 6 }}>{`${tail}…`}</div> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            {logoImg ? <img src={logoImg} width={44} height={44} style={{ borderRadius: 12, marginRight: 12 }} /> : null}
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: "#14C1AD" }}>트롯트립 팬 라운지</div>
            <div style={{ display: "flex", marginLeft: 24, fontSize: 26, fontWeight: 500, color: "#6B7780" }}>{meta}</div>
            <div style={{ display: "flex", marginLeft: "auto", fontSize: 28, fontWeight: 900, color: "#fff", background: "#FA2D48", borderRadius: 999, padding: "10px 26px" }}>이어서 보기 →</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined, headers: { "cache-control": "public, max-age=3600" } },
  );
}
