// POST /api/community — 팬 라운지 글쓰기 (카카오 로그인 또는 닉네임 체험 로그인)
import { z } from "zod";
import { createFanPost } from "@/lib/db";
import { getFanUser } from "@/lib/fanauth";
import { ALL_SLUG, FAN_ARTISTS, POST_CATEGORIES, PHOTO_URL_RE } from "@/lib/community";
import { bad, body, ok } from "@/lib/http";

const Input = z.object({
  artist: z.string().refine((s) => s === ALL_SLUG || FAN_ARTISTS.some((a) => a.slug === s), "가수를 골라 주세요"),
  category: z.enum(POST_CATEGORIES),
  title: z.string().trim().min(1, "제목을 써 주세요").max(60),
  body: z.string().trim().min(2, "내용을 써 주세요").max(2000),
  // 우리가 올린 사진 주소만(Supabase Storage 공개 주소 또는 로컬 개발 주소), 최대 4장
  images: z.array(z.string().max(500).refine((u) => PHOTO_URL_RE.test(u), "사진 주소를 확인해 주세요")).max(4).default([]),
  // 질문·투표 글의 투표 보기(2~4개)
  poll: z.preprocess((v) => (Array.isArray(v) ? v.map((o) => String(o).trim()).filter(Boolean) : v), z.array(z.string().max(40)).min(2, "투표 보기를 2개 이상 써 주세요").max(4)).optional(),
});

export async function POST(req: Request) {
  const user = await getFanUser();
  if (!user) return bad("로그인이 필요해요", 401);
  const r = Input.safeParse(await body(req));
  if (!r.success) return bad(r.error.issues[0]?.message ?? "입력을 확인해 주세요");
  const { poll, ...rest } = r.data;
  const post = await createFanPost({ ...rest, ...(poll ? { poll: poll.map((label) => ({ label, votes: 0 })) } : {}), author_id: user.id, author_name: user.name });
  return ok({ post });
}
