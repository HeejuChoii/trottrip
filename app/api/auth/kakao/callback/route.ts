// GET /api/auth/kakao/callback — 카카오 로그인 완료 → 쿠키 저장 → 원래 화면으로
import { NextResponse } from "next/server";
import { kakaoFinish, setFanUser } from "@/lib/fanauth";
import { recordFanMember } from "@/lib/db";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/fan?login=cancel", u.origin));
  try {
    const { user, next } = await kakaoFinish(code, u.searchParams.get("state") ?? "", `${u.origin}/api/auth/kakao/callback`);
    await setFanUser(user);
    await recordFanMember(user);
    return NextResponse.redirect(new URL(next, u.origin));
  } catch (e) {
    console.warn("[auth] 카카오 로그인 실패:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL("/fan?login=fail", u.origin));
  }
}
