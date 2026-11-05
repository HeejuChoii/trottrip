// GET /api/auth/kakao?next=/fan — 카카오 로그인 시작
import { NextResponse } from "next/server";
import { kakaoAuthorizeUrl, kakaoLoginReady } from "@/lib/fanauth";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!kakaoLoginReady()) return NextResponse.redirect(new URL("/fan?login=off", u.origin));
  const next = u.searchParams.get("next") || "/fan";
  return NextResponse.redirect(await kakaoAuthorizeUrl(`${u.origin}/api/auth/kakao/callback`, next));
}
