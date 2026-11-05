import Link from "next/link";
import { artistBySlug, inkOn, timeAgo, type FanPost } from "@/lib/community";

const CAT_ICON: Record<string, string> = { "질문·투표": "🗳️", "공연 후기": "🎤", "팬덤 스팟 여행": "📍", "스밍 인증": "🎧", "사진 자랑": "📸", "같이 가요": "🙌", "자유": "💬" };

export default function PostCard({ p, showArtist = false }: { p: FanPost; showArtist?: boolean }) {
  const a = artistBySlug(p.artist);
  return (
    <Link href={`/fan/post/${p.id}`} className="card post" style={{ textDecoration: "none", color: "inherit", position: "relative", paddingRight: p.images?.length ? 96 : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.images?.[0] && <img src={p.images[0]} alt="" style={{ position: "absolute", right: 12, top: 14, width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />}
      <span className="pmeta">
        {showArtist && a && <span className="tag" style={{ background: a.color, color: inkOn(a.color), marginTop: 0 }}>{a.name}</span>}
        {showArtist && !a && <span className="tag" style={{ background: "#111", color: "#fff", marginTop: 0 }}>트롯 수다방</span>}
        <span className="tag pk" style={{ marginTop: 0 }}>{CAT_ICON[p.category] ?? ""} {p.category}</span>
      </span>
      <b className="ptitle">{p.title}</b>
      <span className="pbody">{p.body}</span>
      <small className="pfoot">{p.author_name} · {timeAgo(p.created_at)} · ♥ {p.likes} · 💬 {p.comments}{p.images && p.images.length > 1 ? ` · 📷 ${p.images.length}` : ""}{p.poll ? ` · 🗳️ ${p.poll.reduce((n, o) => n + o.votes, 0)}명 투표` : ""}</small>
    </Link>
  );
}
