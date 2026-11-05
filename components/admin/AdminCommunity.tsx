"use client";
import { useState } from "react";
import { postJSON } from "@/lib/client";

type P = { id: string; artist: string; title: string; author_name: string; created_at: string; reports?: number; hidden?: boolean; images?: string[] };

/** 팬 라운지 관리: 신고 많은 글부터, 숨기기·다시 보이기 (신고 3건이면 자동으로 숨겨짐) */
export default function AdminCommunity() {
  const [posts, setPosts] = useState<P[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  async function run(action: string, id?: string) {
    setBusy(id ?? action); setMsg("");
    try { const r = await postJSON<{ posts: P[] }>("/api/admin/community", { action, id }); setPosts(r.posts); }
    catch (e) { setMsg(e instanceof Error ? e.message : "실패"); }
    setBusy("");
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>팬 라운지 신고·숨기기</b>
      <small style={{ color: "var(--sub)" }}>신고가 3건 쌓이면 자동으로 숨겨져요. 확인 후 다시 보이게 하거나, 문제 있는 글은 숨겨 두세요(목데이터 글은 빠져요).</small>
      <button className="mini-btn" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={() => run("list")}>{busy === "list" ? "불러오는 중…" : "글 목록 불러오기"}</button>
      {msg && <p className="err" style={{ margin: 0 }}>{msg}</p>}
      {posts && (
        <div className="tblwrap"><table>
          <thead><tr><th>글</th><th>가수</th><th>신고</th><th>상태</th><th></th></tr></thead>
          <tbody>{posts.map((p) => (
            <tr key={p.id}>
              <td><a href={`/fan/post/${p.id}`} target="_blank" rel="noopener noreferrer"><b>{p.title}</b></a><br /><small>{p.author_name} · {p.created_at.slice(0, 16).replace("T", " ")}{p.images?.length ? ` · 📷 ${p.images.length}` : ""}</small></td>
              <td><small>{p.artist}</small></td>
              <td className="n">{p.reports ?? 0}</td>
              <td>{p.hidden ? <span className="err">숨김</span> : "보임"}</td>
              <td><button className={`mini-btn ${p.hidden ? "" : "del"}`} disabled={!!busy} onClick={() => run(p.hidden ? "show" : "hide", p.id)}>{busy === p.id ? "…" : p.hidden ? "다시 보이기" : "숨기기"}</button></td>
            </tr>
          ))}
          {!posts.length && <tr><td colSpan={5}>아직 올라온 글이 없어요</td></tr>}</tbody>
        </table></div>
      )}
    </div>
  );
}
