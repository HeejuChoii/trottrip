// GET /api/p/{token}/route?from=lat,lng&to=lat,lng — 우리 지도 안 자동차·택시 길(카카오내비). 안내장 링크가 있는 사람만
import { getTripBy } from "@/lib/db";
import { carRoute } from "@/lib/kakao-local";
import { bad, ok } from "@/lib/http";

const ll = (s: string | null) => {
  const [a, b] = (s ?? "").split(",").map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && a > 32 && a < 40 && b > 123 && b < 133 ? { lat: a, lng: b } : null;
};

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await getTripBy("parent_token", token))) return bad("안내장을 찾을 수 없어요", 404);
  const u = new URL(req.url);
  const from = ll(u.searchParams.get("from")), to = ll(u.searchParams.get("to"));
  if (!from || !to) return bad("좌표를 확인해 주세요");
  try {
    const r = await carRoute(from, to);
    return r ? ok({ ok: true, ...r }) : ok({ ok: false, reason: "경로 없음" });
  } catch (e) {
    // 카카오내비를 안 켰으면 403 — 화면은 직선·예상 시간만 보여 준다
    return ok({ ok: false, reason: e instanceof Error ? e.message : "실패" });
  }
}
