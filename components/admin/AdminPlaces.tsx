"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { postJSON } from "@/lib/client";
import { CATEGORY_LABEL, FAN_LABEL } from "@/lib/concertrip";
import { PLACE_CATEGORIES, PLACE_TAGS, type Concert, type Place, type PlaceCategory, type PlaceTag } from "@/lib/types";
import type { NoticeExtract } from "@/lib/notice-extract";

const ORIGIN_LABEL: Record<string, string> = { concertrip: "콘서트립", kakao: "카카오", manual: "직접 입력", notice: "공지", research: "웹 조사" };
const TAG_LABEL: Record<PlaceTag, string> = { korean: "한식", chinese: "중식", japanese: "일식", western: "양식", snack: "분식", asian: "아시아", mild: "안 매움", seafood: "해산물", quick: "빨리", indoor: "실내", elevator: "엘리베이터", seating: "앉을 곳", accessible: "무장애" };

type Form = { id?: string; scope: "venue" | "concert"; name: string; category: PlaceCategory; description_ko: string; walk: string; lat: string; lng: string; address: string; tags: PlaceTag[]; fan_type: Place["fan_type"]; evidence: string; source: Place["source"] };
const emptyForm = (scope: "venue" | "concert"): Form => ({ scope, name: "", category: "toilet", description_ko: "", walk: "", lat: "", lng: "", address: "", tags: [], fan_type: "none", evidence: "", source: "needs_check" });

export default function AdminPlaces({ concert, places, scopeOf, kakao, ai }: { concert: Concert; places: Place[]; scopeOf: Record<string, string>; kakao: boolean; ai: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [radius, setRadius] = useState(800);
  const [form, setForm] = useState<Form | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [notice, setNotice] = useState("");
  const [noticeUrl, setNoticeUrl] = useState("");
  const [noticeScope, setNoticeScope] = useState<"concert" | "venue">("concert");
  const [ex, setEx] = useState<NoticeExtract | null>(null);

  async function run<T>(key: string, data: Record<string, unknown>, done?: (r: T) => string) {
    setBusy(key); setMsg("");
    try {
      const r = await postJSON<T>("/api/admin/tt-places", { concert_id: concert.id, ...data });
      if (done) setMsg(done(r));
      router.refresh();
      return r;
    } catch (e) { setMsg(e instanceof Error ? e.message : "실패"); return null; }
    finally { setBusy(""); }
  }

  const shown = useMemo(() => places
    .filter((p) => filter === "all" || p.category === filter || p.origin === filter)
    .sort((a, b) => a.category.localeCompare(b.category) || (a.walk_min_from_venue ?? 99) - (b.walk_min_from_venue ?? 99)), [places, filter]);

  function edit(p: Place) {
    setForm({ id: p.id, scope: (scopeOf[p.id] as "venue" | "concert") ?? "venue", name: p.name, category: p.category, description_ko: p.description_ko,
      walk: p.walk_min_from_venue?.toString() ?? "", lat: p.lat?.toString() ?? "", lng: p.lng?.toString() ?? "", address: p.address,
      tags: p.tags, fan_type: p.fan_type, evidence: p.evidence_urls.join(" "), source: p.source });
    scrollTo(0, 0);
  }

  async function saveForm() {
    if (!form) return;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const r = await run("save", { action: "upsert", scope: form.scope, place: {
      id: form.id, name: form.name, category: form.category, description_ko: form.description_ko,
      walk_min_from_venue: num(form.walk), lat: num(form.lat), lng: num(form.lng), address: form.address,
      tags: form.tags, fan_type: form.fan_type, evidence_urls: form.evidence.split(/\s+/).filter(Boolean), source: form.source,
    } }, () => "저장했어요");
    if (r) setForm(null);
  }

  async function findCoords() {
    if (!form?.name) return setMsg("이름을 먼저 넣어 주세요");
    const r = await run<{ result: { name: string; lat: number; lng: number; address: string; distance_m: number | null } }>("geo", { action: "geocode", query: form.name });
    if (r) {
      setForm({ ...form, lat: String(r.result.lat), lng: String(r.result.lng), address: r.result.address, walk: form.walk || (r.result.distance_m != null ? String(Math.max(1, Math.ceil(r.result.distance_m / 50))) : "") });
      setMsg(`찾음: ${r.result.name} (${r.result.address})${r.result.distance_m != null ? ` · 공연장에서 ${r.result.distance_m}m` : ""}`);
    }
  }

  const F = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const row = (label: string, el: React.ReactNode) => <label style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", fontSize: 14 }}><span>{label}</span>{el}</label>;

  return (
    <>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.6 }}>
        <b style={{ fontSize: 17 }}>{concert.title}</b> · {concert.date} {concert.start_time}<br />
        {concert.venue_name} · 공연장 키 <code>{concert.venue_key ?? "없음"}</code> · 좌표 {concert.venue_lat ?? "?"}, {concert.venue_lng ?? "?"}<br />
        <small>공연장 공통 장소(식당·시설·버스)는 같은 공연장 키를 쓰는 모든 공연에 같이 나와요. 공지에서 나온 장소는 이 공연에만 붙어요.</small>
      </div>
      {msg && <p className="note" style={{ textAlign: "left", color: "var(--deep)", fontWeight: 700 }}>{msg}</p>}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>① 주변 식당·카페 불러오기 (카카오 로컬)</b>
          <small style={{ color: "var(--sub)", lineHeight: 1.5 }}>공연장 반경에서 가까운 식당 최대 45곳·카페 15곳. 다시 누르면 카카오 장소만 새로 바꿔요(직접 고친 장소는 그대로). 한식·중식·일식·양식·분식은 카카오 분류로 붙이고, 맵기는 AI가 이름·분류로 추정해요(메뉴판은 카카오가 API로 주지 않아요). 평점은 받지 않아요.</small>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            반경 <select className="inp sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[500, 800, 1200, 2000].map((r) => <option key={r} value={r}>{r}m</option>)}</select>
            <button className="mini-btn" disabled={!kakao || !!busy} onClick={() => run<{ restaurants: number; cafes: number; labeled: number }>("kakao", { action: "kakao_import", radius }, (r) => `식당 ${r.restaurants}곳, 카페 ${r.cafes}곳 불러왔어요 · AI 맵기 라벨 ${r.labeled}곳`)}>{busy === "kakao" ? "불러오는 중…" : "불러오기"}</button>
            <button className="mini-btn" disabled={!ai || !!busy} onClick={() => run<{ labeled: number }>("label", { action: "label_spice" }, (r) => `AI 맵기 라벨 ${r.labeled}곳`)}>{busy === "label" ? "라벨 다는 중…" : "AI 맵기 라벨 다시 달기"}</button>
          </span>
          {!kakao && <small className="err">KAKAO_REST_API_KEY 환경변수가 필요해요</small>}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>⓪ 웹 조사 시설 넣기</b>
          <small style={{ color: "var(--sub)", lineHeight: 1.5 }}>Claude가 웹에서 모은 이 공연장의 화장실·물품보관·안내소·역 정보를 한 번에 넣어요(근거 링크 포함, &quot;확인 전&quot; 표시). 넣은 뒤 아래 표에서 &quot;수정 → 이름으로 좌표 찾기&quot;로 위치를 잡아 주세요.</small>
          <button className="mini-btn" style={{ alignSelf: "flex-start" }} disabled={!!busy || !concert.venue_key} onClick={() => run<{ count: number }>("research", { action: "import_research" }, (r) => `웹 조사 시설 ${r.count}곳을 넣었어요`)}>{busy === "research" ? "넣는 중…" : "조사 자료 넣기"}</button>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>② 공지·팬 정리글 붙여 넣기 → AI 정리</b>
          <small style={{ color: "var(--sub)", lineHeight: 1.5 }}>예매처·소속사 SNS·팬카페의 MD 부스, 포토존, 게이트, 셔틀 승하차 공지를 그대로 붙여 넣으세요. 정리 결과를 확인한 뒤에만 저장돼요.</small>
          <textarea className="inp" rows={5} value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="공지 원문" />
          <input className="inp sm" value={noticeUrl} onChange={(e) => setNoticeUrl(e.target.value)} placeholder="공지 링크(근거로 저장)" />
          <span className="chips">
            <button type="button" className="chip" aria-pressed={noticeScope === "concert"} onClick={() => setNoticeScope("concert")}>이 공연 공지 (게이트·MD·셔틀)</button>
            <button type="button" className="chip" aria-pressed={noticeScope === "venue"} onClick={() => setNoticeScope("venue")}>공연장 시설·팬 꿀팁 (공통, 확인 전)</button>
          </span>
          <button className="mini-btn" disabled={!ai || !!busy || notice.length < 20} onClick={async () => { const r = await run<{ extract: NoticeExtract }>("ex", { action: "notice_extract", text: notice }); if (r) setEx(r.extract); }}>{busy === "ex" ? "정리 중…" : "정리하기"}</button>
          {!ai && <small className="err">ANTHROPIC_API_KEY가 필요해요</small>}
        </div>
      </div>

      {ex && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8, borderColor: "var(--purple)" }}>
          <b>공지 정리 결과 — 확인 후 저장</b>
          {row("요약(공지 문구)", <textarea className="inp" rows={3} value={ex.summary} onChange={(e) => setEx({ ...ex, summary: e.target.value })} />)}
          {row("MD 부스 시간", <input className="inp sm" value={ex.md_hours} onChange={(e) => setEx({ ...ex, md_hours: e.target.value })} />)}
          {row("입장 시작", <input className="inp sm" value={ex.entry_start} onChange={(e) => setEx({ ...ex, entry_start: e.target.value })} />)}
          {row("구역→게이트", <span>{ex.gate_map.length ? ex.gate_map.map((g, i) => <span key={i} className="tag ok" style={{ marginRight: 4 }}>{g.zone} → {g.gate} <button className="linkbtn" style={{ padding: 0, fontSize: 12 }} onClick={() => setEx({ ...ex, gate_map: ex.gate_map.filter((_, j) => j !== i) })}>✕</button></span>) : "없음"}</span>)}
          <div className="tblwrap"><table>
            <thead><tr><th>종류</th><th>이름</th><th>위치</th><th>시간</th><th>좌표 검색어</th><th></th></tr></thead>
            <tbody>{ex.places.map((p, i) => (
              <tr key={i}><td>{CATEGORY_LABEL[p.category]}</td><td>{p.name}</td><td>{p.description_ko}</td><td>{p.hours}</td><td>{p.location_query}</td>
                <td><button className="mini-btn del" onClick={() => setEx({ ...ex, places: ex.places.filter((_, j) => j !== i) })}>빼기</button></td></tr>
            ))}</tbody>
          </table></div>
          {ex.unclear.length > 0 && <p className="err" style={{ fontSize: 13 }}>확인 필요: {ex.unclear.join(" / ")}</p>}
          <span style={{ display: "flex", gap: 8 }}>
            <button className="mini-btn" onClick={() => setEx(null)}>취소</button>
            <button className="mini-btn" style={{ background: "var(--deep)", color: "#fff" }} disabled={!!busy} onClick={async () => { const r = await run<{ places: number }>("apply", { action: "notice_apply", extract: ex, source_url: noticeUrl, scope: noticeScope }, (r) => `공지 반영: 장소 ${r.places}곳, 게이트·공지 문구 저장`); if (r) { setEx(null); setNotice(""); } }}>저장</button>
          </span>
        </div>
      )}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <b>③ 직접 입력 (시설·버스 승하차·쉼터 등)</b>
          {!form && <span style={{ display: "flex", gap: 6 }}><button className="mini-btn" onClick={() => setForm(emptyForm("venue"))}>+ 공연장 공통</button><button className="mini-btn" onClick={() => setForm(emptyForm("concert"))}>+ 이 공연만</button></span>}
        </span>
        {form && (
          <>
            {row("범위", <select className="inp sm" value={form.scope} onChange={(e) => F({ scope: e.target.value as Form["scope"] })}><option value="venue">공연장 공통</option><option value="concert">이 공연만</option></select>)}
            {row("이름", <input className="inp sm" value={form.name} onChange={(e) => F({ name: e.target.value })} placeholder="예: D홀 앞 실내 쉼터" />)}
            {row("종류", <select className="inp sm" value={form.category} onChange={(e) => F({ category: e.target.value as PlaceCategory })}>{PLACE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>)}
            {row("찾아가는 법", <input className="inp sm" value={form.description_ko} onChange={(e) => F({ description_ko: e.target.value })} placeholder="예: 3번 입구 들어가서 오른쪽, 엘리베이터 옆" />)}
            {row("좌표", <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><input className="inp sm" style={{ width: 110 }} value={form.lat} onChange={(e) => F({ lat: e.target.value })} placeholder="위도" /><input className="inp sm" style={{ width: 110 }} value={form.lng} onChange={(e) => F({ lng: e.target.value })} placeholder="경도" /><button className="mini-btn" disabled={!kakao || !!busy} onClick={findCoords}>이름으로 좌표 찾기</button></span>)}
            {row("공연장에서 도보(분)", <input className="inp sm" value={form.walk} onChange={(e) => F({ walk: e.target.value })} placeholder="비우면 좌표로 계산" />)}
            {row("태그", <span className="chips">{PLACE_TAGS.map((t) => <button key={t} type="button" className="chip" aria-pressed={form.tags.includes(t)} onClick={() => F({ tags: form.tags.includes(t) ? form.tags.filter((x) => x !== t) : [...form.tags, t] })}>{TAG_LABEL[t]}</button>)}</span>)}
            {row("팬덤 구분", <select className="inp sm" value={form.fan_type} onChange={(e) => F({ fan_type: e.target.value as Place["fan_type"] })}><option value="none">없음</option><option value="official">공식 장소</option><option value="artist_visited">가수 방문</option><option value="fan_made">팬 명소</option></select>)}
            {row("근거 링크", <input className="inp sm" value={form.evidence} onChange={(e) => F({ evidence: e.target.value })} placeholder="띄어쓰기로 여러 개" />)}
            {row("확인 여부", <select className="inp sm" value={form.source} onChange={(e) => F({ source: e.target.value as Place["source"] })}><option value="verified">공식·현장 확인</option><option value="needs_check">확인 전</option></select>)}
            <span style={{ display: "flex", gap: 8 }}><button className="mini-btn" onClick={() => setForm(null)}>취소</button><button className="mini-btn" style={{ background: "var(--deep)", color: "#fff" }} disabled={!!busy || !form.name} onClick={saveForm}>저장</button></span>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <b>장소 {places.length}곳</b>
        <select className="inp sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">전체</option>
          {Object.entries(ORIGIN_LABEL).map(([k, v]) => <option key={k} value={k}>출처: {v}</option>)}
          {PLACE_CATEGORIES.map((c) => <option key={c} value={c}>종류: {CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="tblwrap"><table>
        <thead><tr><th>출처</th><th>종류</th><th>이름</th><th>도보</th><th>태그</th><th>AI 맵기</th><th>설명</th><th>확인</th><th></th></tr></thead>
        <tbody>{shown.map((p) => {
          const own = p.origin !== "concertrip";
          return (
            <tr key={p.id}>
              <td>{ORIGIN_LABEL[p.origin ?? "concertrip"]}{own ? <><br /><small>{scopeOf[p.id] === "concert" ? "이 공연만" : "공연장 공통"}</small></> : null}</td>
              <td>{CATEGORY_LABEL[p.category]}{p.fan_type !== "none" && <><br /><span className="tag pk">{FAN_LABEL[p.fan_type]}</span></>}</td>
              <td>{p.link_url ? <a href={p.link_url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p.name}{p.category_detail && <><br /><small>{p.category_detail}</small></>}{p.lat == null && <><br /><small className="err">좌표 없음(지도에 안 보임)</small></>}</td>
              <td className="n">{p.walk_min_from_venue ?? "-"}</td>
              <td><small>{p.tags.map((t) => TAG_LABEL[t] ?? t).join(", ")}</small></td>
              <td><small>{p.ai_spice ? `${({ mild: "덜 매움", medium: "보통", spicy: "매움", unknown: "모름" } as Record<string, string>)[p.ai_spice]}${p.ai_note ? ` · ${p.ai_note}` : ""}` : "-"}</small></td>
              <td><small>{p.description_ko}</small></td>
              <td><small>{p.source === "verified" ? "확인" : "확인 전"}</small></td>
              <td>{own
                ? <span style={{ display: "flex", gap: 4 }}><button className="mini-btn" onClick={() => edit(p)}>수정</button><button className="mini-btn del" disabled={!!busy} onClick={() => { if (confirm(`${p.name}을(를) 지울까요?`)) run("del", { action: "delete", id: p.id }, () => "지웠어요"); }}>삭제</button></span>
                : <small>콘서트립에서 수정</small>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </>
  );
}
