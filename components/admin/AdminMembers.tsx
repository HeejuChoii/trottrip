import type { MemberRow } from "@/lib/db";

const kst = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 운영자: 팬 라운지 가입자(카카오 로그인·닉네임 체험). 닉네임만 저장해요
export default function AdminMembers({ rows, tableReady }: { rows: MemberRow[]; tableReady: boolean }) {
  const kakao = rows.filter((r) => r.provider === "kakao").length;
  const guest = rows.filter((r) => r.provider === "guest").length;
  const t = today();
  const newToday = rows.filter((r) => dayOf(r.first_at) === t).length;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <b>팬 라운지 가입자 {rows.length}명</b>
      <small style={{ color: "var(--sub)" }}>카카오 {kakao} · 닉네임 체험 {guest} · 오늘 새로 {newToday}명. 닉네임만 저장하고 이메일·전화번호는 받지 않아요.</small>
      {!tableReady && <small className="err">가입 기록 표가 아직 없어요. Supabase에서 0010 SQL을 실행하면 로그인한 사람이 모두 쌓여요. 지금은 글·댓글을 쓴 사람만 보여요.</small>}
      <div className="tblwrap"><table>
        <thead><tr><th>닉네임</th><th>방식</th><th>가입</th><th>최근 접속</th><th>로그인</th><th>글</th><th>댓글</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b></td>
              <td>{r.provider === "kakao" ? "카카오" : r.provider === "guest" ? "닉네임 체험" : r.provider}</td>
              <td className="n">{kst(r.first_at)}{!r.recorded && <small> (첫 글 기준)</small>}</td>
              <td className="n">{kst(r.last_at)}</td>
              <td className="n">{r.recorded ? r.logins : "-"}</td>
              <td className="n">{r.posts}</td>
              <td className="n">{r.comments}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7}>아직 가입한 사람이 없어요</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
