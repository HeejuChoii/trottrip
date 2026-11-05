// GET /api/community/file?n= — 로컬 개발용 사진 보기(배포에서는 Supabase Storage 주소를 바로 씀)
import { readLocalUpload } from "@/lib/db";

export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n") ?? "";
  const buf = await readLocalUpload(n);
  if (!buf) return new Response("not found", { status: 404 });
  const type = n.endsWith(".png") ? "image/png" : n.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
}
