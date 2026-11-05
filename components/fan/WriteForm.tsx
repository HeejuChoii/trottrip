"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";
import { POST_CATEGORIES } from "@/lib/community";
import { uploadPhoto } from "@/lib/photo";

export default function WriteForm({ artist, defaultCategory }: { artist: string; defaultCategory: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  // 투표 만들기(질문·투표 말머리): 보기 2~4개
  const [poll, setPoll] = useState<string[]>(["", ""]);
  const usePoll = category === "질문·투표" && poll.some((o) => o.trim());

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const pick = [...files].slice(0, 4 - images.length);
    setErr(""); setUploading((n) => n + pick.length);
    for (const f of pick) {
      try {
        const url = await uploadPhoto(f);
        setImages((l) => [...l, url].slice(0, 4));
      } catch (x) { setErr(x instanceof Error ? x.message : "사진을 올리지 못했어요"); }
      setUploading((n) => n - 1);
    }
  }
  if (!open) return <button className="cta" onClick={() => setOpen(true)}>✏️ 글쓰기</button>;
  return (
    <form className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      try {
        const r = await postJSON<{ post: { id: string } }>("/api/community", { artist, category, title, body, images, poll: usePoll ? poll.map((o) => o.trim()).filter(Boolean) : undefined });
        router.push(`/fan/post/${r.post.id}`);
      } catch (x) { setErr(x instanceof Error ? x.message : "올리지 못했어요"); setBusy(false); }
    }}>
      <div className="chips">{POST_CATEGORIES.map((k) => <button key={k} type="button" className="chip" aria-pressed={category === k} onClick={() => setCategory(k)}>{k}</button>)}</div>
      <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" maxLength={60} />
      <textarea className="inp" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={category === "질문·투표" ? "팬들에게 묻고 싶은 걸 써 주세요. 예) 여러분의 입덕곡은? 저는 ○○예요" : category === "팬덤 스팟 여행" ? "어디를 다녀오셨어요? 가는 법·맛집 팁도 나눠 주세요" : category === "스밍 인증" ? "오늘 몇 번 들으셨어요?" : "자유롭게 나눠 주세요"} maxLength={2000} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {images.map((u) => (
          <span key={u} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="올린 사진" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
            <button type="button" aria-label="사진 빼기" onClick={() => setImages((l) => l.filter((x) => x !== u))} style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", border: 0, background: "#111", color: "#fff", fontSize: 13 }}>×</button>
          </span>
        ))}
        {images.length < 4 && (
          <label className="mini-btn" style={{ cursor: "pointer", padding: "10px 12px" }}>
            📷 사진 추가 ({images.length}/4)
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        {uploading > 0 && <small style={{ color: "var(--sub)" }}>사진 올리는 중…</small>}
      </div>
      {category === "질문·투표" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <b style={{ fontSize: 15 }}>🗳️ 투표 보기 <small style={{ fontWeight: 400, color: "var(--sub)" }}>(비워 두면 투표 없이 질문만 올라가요)</small></b>
          {poll.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <input className="inp" value={o} maxLength={40} placeholder={`보기 ${i + 1}${i === 0 ? " 예) 이제 나만 믿어요" : ""}`} onChange={(e) => setPoll((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
              {poll.length > 2 && <button type="button" className="mini-btn" aria-label="보기 빼기" onClick={() => setPoll((l) => l.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
          {poll.length < 4 && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => setPoll((l) => [...l, ""])}>+ 보기 더하기</button>}
        </div>
      )}
      {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
      <div className="row2"><button type="button" className="ghost" onClick={() => setOpen(false)}>취소</button><button className="cta" disabled={busy || uploading > 0}>{busy ? "올리는 중…" : "올리기"}</button></div>
    </form>
  );
}
