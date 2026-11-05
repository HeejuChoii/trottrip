// POST /api/community/upload (multipart: file) — 팬 라운지 사진 올리기(로그인 필요, 3MB·JPEG/PNG/WEBP)
import { randomUUID } from "crypto";
import { uploadFanImage } from "@/lib/db";
import { getFanUser } from "@/lib/fanauth";
import { bad, ok } from "@/lib/http";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request) {
  const user = await getFanUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") return bad("사진을 골라 주세요");
  const ext = TYPES[f.type];
  if (!ext) return bad("JPG·PNG·WEBP 사진만 올릴 수 있어요");
  if (f.size > 3 * 1024 * 1024) return bad("사진이 너무 커요(3MB까지)");
  const d = new Date();
  const name = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  try {
    return ok({ url: await uploadFanImage(name, Buffer.from(await f.arrayBuffer()), f.type) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "사진을 올리지 못했어요", 500);
  }
}
