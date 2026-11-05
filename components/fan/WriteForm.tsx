"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";
import { POST_CATEGORIES } from "@/lib/community";

export default function WriteForm({ artist, defaultCategory }: { artist: string; defaultCategory: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!open) return <button className="cta" onClick={() => setOpen(true)}>✏️ 글쓰기</button>;
  return (
    <form className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      try {
        const r = await postJSON<{ post: { id: string } }>("/api/community", { artist, category, title, body });
        router.push(`/fan/post/${r.post.id}`);
      } catch (x) { setErr(x instanceof Error ? x.message : "올리지 못했어요"); setBusy(false); }
    }}>
      <div className="chips">{POST_CATEGORIES.map((k) => <button key={k} type="button" className="chip" aria-pressed={category === k} onClick={() => setCategory(k)}>{k}</button>)}</div>
      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" maxLength={60} />
      <textarea className="inp" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={category === "팬덤 스팟 여행" ? "어디를 다녀오셨어요? 가는 법·맛집 팁도 나눠 주세요" : category === "스밍 인증" ? "오늘 몇 번 들으셨어요?" : "자유롭게 나눠 주세요"} maxLength={2000} />
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <div className="row2"><button type="button" className="ghost" onClick={() => setOpen(false)}>취소</button><button className="cta" disabled={busy}>{busy ? "올리는 중…" : "올리기"}</button></div>
    </form>
  );
}
