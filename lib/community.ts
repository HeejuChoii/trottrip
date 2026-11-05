// 팬 라운지(가수별 커뮤니티): 공연 후기·팬덤 스팟 여행·스밍 인증·사진 자랑·자유
import mock from "../data/community-mock.json" with { type: "json" };

export interface FanArtist { slug: string; name: string; fandom: string; color: string }
/** 가수 사진은 public/artists/{slug}.jpg (없으면 색 동그라미에 이름) */
export const FAN_ARTISTS: FanArtist[] = [
  { slug: "lim-youngwoong", name: "임영웅", fandom: "영웅시대", color: "#3A8DDE" },
  { slug: "lee-chanwon", name: "이찬원", fandom: "찬스", color: "#F2A33A" },
  { slug: "park-seojin", name: "박서진", fandom: "닻별", color: "#E8B400" },
  { slug: "song-gain", name: "송가인", fandom: "어게인", color: "#E2557B" },
  { slug: "youngtak", name: "영탁", fandom: "영탁앤블루스", color: "#2F7D6D" },
  { slug: "lee-seungchul", name: "이승철", fandom: "새들의 고향", color: "#E07A1F" },
  { slug: "kim-gunmo", name: "김건모", fandom: "", color: "#6B5BD6" },
  { slug: "cho-yongpil", name: "조용필", fandom: "위대한 탄생", color: "#555B6E" },
];
export const artistBySlug = (slug: string) => FAN_ARTISTS.find((a) => a.slug === slug) ?? null;

export const POST_CATEGORIES = ["공연 후기", "팬덤 스팟 여행", "스밍 인증", "사진 자랑", "같이 가요", "자유"] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export interface FanPost {
  id: string;
  artist: string; // slug
  category: PostCategory;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  likes: number;
  comments: number;
  created_at: string;
  mock?: boolean;
}
export interface FanComment { id: string; post_id: string; author_id: string; author_name: string; body: string; created_at: string }

type MockPost = Omit<FanPost, "id" | "created_at" | "author_id" | "comments" | "mock"> & { hours_ago: number; comments?: { author_name: string; body: string }[] };
const M = (mock as { posts: MockPost[] }).posts;

/** 목데이터 글(시연용). 시각은 지금 기준 몇 시간 전으로 */
export function mockPosts(now = Date.now()): FanPost[] {
  return M.map((p, i) => ({
    id: `mock-${i + 1}`, artist: p.artist, category: p.category, title: p.title, body: p.body, author_id: `mock-${p.author_name}`,
    author_name: p.author_name, likes: p.likes, comments: p.comments?.length ?? 0, created_at: new Date(now - p.hours_ago * 3600000).toISOString(), mock: true,
  }));
}
export function mockComments(postId: string, now = Date.now()): FanComment[] {
  const i = Number(postId.replace("mock-", "")) - 1;
  const p = M[i];
  return (p?.comments ?? []).map((c, j) => ({ id: `${postId}-c${j}`, post_id: postId, author_id: `mock-${c.author_name}`, author_name: c.author_name, body: c.body, created_at: new Date(now - (p.hours_ago - 0.3 * (j + 1)) * 3600000).toISOString() }));
}

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
