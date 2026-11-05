// 팬 라운지(가수별 커뮤니티): 공연 후기·팬덤 스팟 여행·스밍 인증·사진 자랑·자유
import mock from "../data/community-mock.json" with { type: "json" };

export interface FanArtist { slug: string; name: string; fandom: string; color: string }
/** 가수 사진은 public/artists/{slug}.jpg (없으면 색 동그라미에 이름) */
export const FAN_ARTISTS: FanArtist[] = [
  // 색: 영웅시대 하늘색, 찬스 노랑, 닻별 노랑, 어게인 분홍, 영탁앤블루스 코발트 블루(보도·팬덤 기준). 이승철·김건모·조용필은 공식 색을 확인하지 못해 임의 색
  { slug: "lim-youngwoong", name: "임영웅", fandom: "영웅시대", color: "#5BB8EE" },
  { slug: "lee-chanwon", name: "이찬원", fandom: "찬스", color: "#F7C531" },
  { slug: "park-seojin", name: "박서진", fandom: "닻별", color: "#FFD43B" },
  { slug: "song-gain", name: "송가인", fandom: "어게인", color: "#F06292" },
  { slug: "youngtak", name: "영탁", fandom: "영탁앤블루스", color: "#0047AB" },
  { slug: "lee-seungchul", name: "이승철", fandom: "새침데기", color: "#E07A1F" },
  { slug: "kim-gunmo", name: "김건모", fandom: "", color: "#6B5BD6" },
  { slug: "cho-yongpil", name: "조용필", fandom: "위대한 탄생", color: "#555B6E" },
];
/** 칩 글자색: 밝은 색(노랑·하늘색) 위에는 검정, 진한 색 위에는 흰색 */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? "#111" : "#fff";
}
export const artistBySlug = (slug: string) => FAN_ARTISTS.find((a) => a.slug === slug) ?? null;
/** 가수 사진(public/artists/{slug}.jpg). 공연과 상관없는 팬덤 스팟 여행에서 포스터 대신 쓴다 */
export function artistPhoto(name: string): string | null {
  const a = FAN_ARTISTS.find((x) => x.name === name);
  return a ? `/artists/${a.slug}.jpg` : null;
}
/** 가수 상관없이 이야기하는 트롯 수다방(라운지 홈) */
export const ALL_SLUG = "all";

export const POST_CATEGORIES = ["질문·투표", "공연 후기", "팬덤 스팟 여행", "스밍 인증", "사진 자랑", "같이 가요", "자유"] as const;
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
  /** 사진 주소(최대 4장) */
  images?: string[];
  /** 관리자가 숨긴 글 / 신고 수 */
  hidden?: boolean;
  reports?: number;
  /** 투표 글: 보기와 표 수(목데이터 기본 표 + 실제 표) */
  poll?: PollOption[];
}
export interface PollOption { label: string; votes: number }
export interface FanComment { id: string; post_id: string; author_id: string; author_name: string; body: string; created_at: string; images?: string[] }
/** 우리가 올린 사진 주소만 받는다(Supabase Storage 공개 주소, 로컬 개발 주소, 시연용 public/mock) */
export const PHOTO_URL_RE = /^(https:\/\/[\w.-]+\/storage\/v1\/object\/public\/community\/|\/api\/community\/file\?n=)/;

type MockPost = Omit<FanPost, "id" | "created_at" | "author_id" | "comments" | "mock"> & { hours_ago: number; comments?: { author_name: string; body: string; images?: string[] }[] };
const M = (mock as { posts: MockPost[] }).posts;

/** 목데이터 글(시연용). 시각은 지금 기준 몇 시간 전으로 */
export function mockPosts(now = Date.now()): FanPost[] {
  return M.map((p, i) => ({
    id: `mock-${i + 1}`, artist: p.artist, category: p.category, title: p.title, body: p.body, author_id: `mock-${p.author_name}`,
    author_name: p.author_name, likes: p.likes, comments: p.comments?.length ?? 0, ...(p.images ? { images: p.images } : {}), created_at: new Date(now - p.hours_ago * 3600000).toISOString(), mock: true,
    ...(p.poll ? { poll: p.poll } : {}),
  }));
}
export function mockComments(postId: string, now = Date.now()): FanComment[] {
  const i = Number(postId.replace("mock-", "")) - 1;
  const p = M[i];
  const cs = p?.comments ?? [];
  // 댓글 시각: 글 올린 뒤부터 지금 사이에 들쭉날쭉 퍼뜨린다(전부 '방금'이면 수상해 보여서). 글마다 같은 값이 나오게 고정
  const w = Array.from({ length: cs.length + 1 }, (_, k) => 1 + ((i * 7 + k * 13) % 10) / 6);
  const sum = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return cs.map((c, j) => {
    acc += w[j];
    const after = p.hours_ago * 0.95 * (acc / sum);
    return { id: `${postId}-c${j}`, post_id: postId, author_id: `mock-${c.author_name}`, author_name: c.author_name, body: c.body, created_at: new Date(now - (p.hours_ago - after) * 3600000).toISOString(), ...(c.images ? { images: c.images } : {}) };
  });
}

export function timeAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
