"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Brand from "./Brand";
import { useKakao } from "./useKakao";
import { ls, postJSON, track } from "@/lib/client";
import { fmtDateKo, fmtTimeKo, isHHMM } from "@/lib/time";
import { shareTitle, sourceName } from "@/lib/text";
import { CATEGORY_LABEL, FAN_LABEL } from "@/lib/concertrip";
import type { ConcertView, ParentProfile, Place, Plan, PlanItem, Prefs, TicketInfo, Transport } from "@/lib/types";
import { estimateSteps, fmtMin } from "@/lib/steps";
import { buildChecklist } from "@/lib/checklist";

const SWAPPABLE = new Set(["meal", "rest", "goods", "photo"]);
const SWAP_LABEL: Record<string, string> = { meal: "다른 식당으로 바꾸기", rest: "다른 쉼터로", goods: "다른 부스로", photo: "다른 포토존으로" };

interface Props {
  kidToken: string;
  parentToken: string;
  plan: Plan;
  concert: ConcertView;
  places: Place[];
  parentHonorific: string;
  share: { kid_label: string; kid_name: string; kid_phone: string };
  kakaoKey: string;
  parent: ParentProfile;
  prefs: Prefs;
  transport: Transport;
  ticket: TicketInfo;
  checklist: Record<string, boolean>;
}

/** 굿즈·포토존·팬덤 스팟(가수가 다녀간 식당 포함)은 분홍 카드 */
function tone(it: PlanItem, p?: Place) {
  if (it.type === "goods" || it.type === "photo" || (p && p.fan_type !== "none")) return "pk";
  return it.type === "extra" ? "pu" : "";
}

/** 출처 표시: 확인된 곳만 "확인됨"을 붙인다(조사·방송 근거 장소에 불안한 꼬리표를 달지 않음) */
function sourceTag(it: PlanItem) {
  if (!it.place_id && it.source === "needs_check" && ["meal", "rest", "goods", "photo"].includes(it.type)) return <span className="tag in">장소 준비 중</span>;
  if (it.source === "verified") return <span className="tag ok">확인됨</span>;
  return null;
}

export default function KidPlan(props: Props) {
  const { kidToken, parentToken, concert, places, kakaoKey } = props;
  const [plan, setPlan] = useState(props.plan);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanItem[]>(props.plan.items);
  const [share, setShare] = useState(props.share);
  const [savedShare, setSavedShare] = useState(props.share);
  const [labelCustom, setLabelCustom] = useState(!["딸", "아들", "조카"].includes(props.share.kid_label));
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [intent, setIntent] = useState<"" | "yes" | "no">("");
  // v1.2 수요 근거: 공유 직후 1문항
  const [survey, setSurvey] = useState<"hidden" | "open" | "done">("hidden");
  const askSurvey = () => { if (!ls.get(`tt_survey_${kidToken}`)) setSurvey((s) => (s === "hidden" ? "open" : s)); };
  const [origin, setOrigin] = useState("");
  const kakao = useKakao(kakaoKey);
  const [tab, setTab] = useState<"plan" | "check" | "ticket">("plan");
  const [ticket, setTicket] = useState<TicketInfo>(props.ticket);
  const [checks, setChecks] = useState<Record<string, boolean>>(props.checklist ?? {});

  useEffect(() => { setOrigin(process.env.NEXT_PUBLIC_SITE_URL || location.origin); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const parentUrl = `${origin}/p/${parentToken}`;
  const kidUrl = `${origin}/k/${kidToken}/status`;
  const title = shareTitle(share.kid_label, share.kid_name, !!concert.pilgrim);
  const pil = !!concert.pilgrim;
  const DAY = pil ? "여행 날" : "공연 날";
  const desc = pil
    ? `${concert.artist_display} 팬덤 스팟 여행 · ${concert.city} · ${fmtDateKo(concert.date)} · 앱 설치 없이 바로 보세요`
    : `〈${concert.title.replace(/.*〈|〉.*/g, "")}〉 · ${fmtDateKo(concert.date)} · 앱 설치 없이 바로 보세요`;
  const ogImage = `${origin}/api/og?t=${parentToken}`;

  const fanPlaces = useMemo(() => {
    const ids = new Set<string>([...plan.items.map((i) => i.place_id).filter(Boolean) as string[], ...(plan.extra_day?.place_ids ?? [])]);
    return [...ids].map((id) => byId.get(id)).filter((p): p is Place => !!p && p.fan_type !== "none");
  }, [plan, byId]);

  async function saveShare() {
    if (JSON.stringify(share) === JSON.stringify(savedShare)) return true;
    try {
      const r = await postJSON<typeof share>(`/api/k/${kidToken}`, { share }, "PATCH");
      setSavedShare({ kid_label: r.kid_label, kid_name: r.kid_name, kid_phone: r.kid_phone });
      return true;
    } catch (e) { setToast(e instanceof Error ? e.message : "저장하지 못했어요"); return false; }
  }

  async function copy(text: string, kind: "parent" | "kid") {
    if (!(await saveShare())) return;
    try {
      await navigator.clipboard.writeText(text);
      setToast("링크를 복사했어요. 문자·밴드에 붙여 넣으세요.");
    } catch {
      if (navigator.share) { navigator.share({ title, text: kind === "parent" ? desc : "진행 상황 보기", url: text }).catch(() => undefined); }
      else window.prompt("이 링크를 복사해 주세요", text);
    }
    if (kind === "parent") { track("share_copy", kidToken); askSurvey(); }
  }

  async function sendKakao(toSelf = false) {
    if (!(await saveShare())) return;
    const url = toSelf ? kidUrl : parentUrl;
    if (kakao && window.Kakao) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: toSelf ? `부모님 ${DAY} 진행 상황` : title,
            description: toSelf ? "누른 버튼과 질문만 보여요. 위치는 보내지 않아요." : desc,
            imageUrl: ogImage,
            imageWidth: 1200,
            imageHeight: 630,
            link: { mobileWebUrl: url, webUrl: url },
          },
          buttons: [{ title: toSelf ? "진행 상황 보기" : "안내장 열기", link: { mobileWebUrl: url, webUrl: url } }],
        });
        if (!toSelf) { track("share_kakao", kidToken); askSurvey(); }
        return;
      } catch { /* 아래 대체 경로 */ }
    }
    // SDK 실패 → Web Share API → 링크 복사
    if (navigator.share) {
      try { await navigator.share({ title, text: desc, url }); if (!toSelf) track("share_kakao", kidToken, undefined, { fallback: "webshare" }); return; } catch { /* 취소 */ }
    }
    copy(url, toSelf ? "kid" : "parent");
  }

  /** 휴대폰이면 공유창(문자·밴드·카톡 등)을 열고, 컴퓨터면 링크를 복사한다. 미리보기(OG) 카드는 링크에서 자동으로 뜬다 */
  async function shareLink() {
    if (!(await saveShare())) return;
    const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (mobile && navigator.share) {
      try {
        await navigator.share({ title, text: `${title}\n${desc}`, url: parentUrl });
        track("share_copy", kidToken, undefined, { via: "webshare" });
        askSurvey();
        return;
      } catch { /* 취소하면 아래로 */ }
    }
    copy(parentUrl, "parent");
  }

  async function saveEdit() {
    for (const it of draft) if (!isHHMM(it.start) || !isHHMM(it.end)) return setToast("시각은 13:40처럼 넣어 주세요");
    setBusy("edit");
    try {
      const r = await postJSON<{ plan: Plan }>(`/api/k/${kidToken}`, { plan: { ...plan, items: draft } }, "PATCH");
      setPlan(r.plan); setDraft(r.plan.items); setEditing(false); setToast("일정을 저장했어요");
    } catch (e) { setToast(e instanceof Error ? e.message : "저장하지 못했어요"); }
    setBusy("");
  }

  async function swap(id: string) {
    setBusy(id);
    try {
      const r = await postJSON<{ plan: Plan }>(`/api/k/${kidToken}/swap`, { item_id: id });
      setPlan(r.plan); setDraft(r.plan.items); setToast("바꿨어요");
    } catch (e) { setToast(e instanceof Error ? e.message : "바꾸지 못했어요"); }
    setBusy("");
  }

  async function lessWalk() {
    setBusy("less");
    try {
      const r = await postJSON<{ plan: Plan }>(`/api/k/${kidToken}/less-walk`, {});
      setPlan(r.plan); setDraft(r.plan.items); setToast("덜 걷게 다시 짰어요");
    } catch (e) { setToast(e instanceof Error ? e.message : "다시 짜지 못했어요"); }
    setBusy("");
  }

  function sendIntent(v: "yes" | "no") {
    setIntent(v);
    track("intent", kidToken, undefined, { answer: v });
  }

  const items = editing ? draft : plan.items;

  return (
    <main className="shell">
      <div className="top"><Brand /><Link className="back" href={`/k/${kidToken}/status`}>진행 상황 보기 →</Link></div>
      <h1 className="h" style={{ fontSize: 22 }}>{plan.title}</h1>
      <p className="lead">{plan.summary}</p>
      <p className="note" style={{ textAlign: "left", margin: "-4px 0 0" }}>{pil ? `${concert.city} · ${fmtDateKo(concert.date)} ${fmtTimeKo(concert.start_time)} ${concert.venue_name}에서 출발` : `${concert.venue_name} · ${fmtDateKo(concert.date)} ${fmtTimeKo(concert.start_time)} 시작`}</p>
      {pil && <p className="note" style={{ textAlign: "left", margin: 0 }}><span className="tag pu">콘서트립에서 불러온 팬덤 스팟</span> 공연 없이 떠나는 {concert.artist_display} 팬덤 스팟 여행이에요</p>}
      {(concert.ticket_url || concert.shuttle_url) && (
        <p className="note" style={{ textAlign: "left", margin: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {concert.ticket_url && <a href={concert.ticket_url} target="_blank" rel="noopener noreferrer">예매처 공지 ↗</a>}
          {concert.shuttle_url && <a href={concert.shuttle_url} target="_blank" rel="noopener noreferrer">공연 셔틀 예약 ↗</a>}
        </p>
      )}
      {plan.general && <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}><b>이 공연은 장소 정보를 준비 중이에요.</b><br />식사·이동·귀가 시각만 담은 일반 일정이에요. 장소가 준비되면 운영자가 콘서트립에 올려요.</div>}

      {plan.fallback_reason && <p className="note" style={{ textAlign: "left", margin: 0 }}>※ {plan.fallback_reason}</p>}
      {(() => {
        const st = estimateSteps(plan, places, props.parent);
        return (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="lab" style={{ margin: 0 }}>오늘 얼마나 움직이세요?</span>
            <b style={{ fontSize: 22 }}>예상 약 {st.steps.toLocaleString("ko-KR")}보</b>
            <span style={{ fontSize: 14, color: "var(--sub)" }}>걷는 시간 약 {fmtMin(st.walk_min)} · 서 있는 시간 약 {fmtMin(st.stand_min)} · {st.compare_text}{st.usual_guessed ? " (걷기 스타일 기준)" : ` (평소 ${st.usual.toLocaleString("ko-KR")}보)`}</span>
            {plan.less_walk
              ? <span className="tag ok" style={{ alignSelf: "flex-start" }}>덜 걷게 바꾼 일정이에요</span>
              : <button className="mini-btn" style={{ alignSelf: "flex-start", fontSize: 14, padding: "8px 12px" }} disabled={busy === "less"} onClick={lessWalk}>{busy === "less" ? "다시 짜는 중…" : "덜 걷게 바꾸기"}</button>}
          </div>
        );
      })()}
      <div className="chips" role="tablist">
        {(pil ? [["plan", "일정"], ["check", "준비 체크리스트"]] as const : [["plan", "일정"], ["check", "준비 체크리스트"], ["ticket", "티켓 정보"]] as const).map(([k, l]) => (
          <button key={k} role="tab" className="chip" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "check" && <ChecklistTab items={buildChecklist({ concert, parent: props.parent, prefs: props.prefs, transport: props.transport, ticket, who: props.parentHonorific })} checks={checks} onToggle={async (id, v) => {
        setChecks((c) => ({ ...c, [id]: v }));
        try { await postJSON(`/api/k/${kidToken}`, { checklist: { [id]: v } }, "PATCH"); } catch { setToast("저장하지 못했어요"); }
      }} />}

      {tab === "ticket" && <TicketTab ticket={ticket} onSave={async (t) => {
        try { const r = await postJSON<{ ticket: TicketInfo }>(`/api/k/${kidToken}`, { ticket: t }, "PATCH"); setTicket(r.ticket); setToast("티켓 정보를 저장했어요. 부모님 화면 '내 티켓'에 보여요"); }
        catch (e) { setToast(e instanceof Error ? e.message : "저장하지 못했어요"); }
      }} />}

      {tab === "plan" && <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="lab" style={{ margin: 0 }}>{DAY} 하루</span>
        {editing
          ? <span style={{ display: "flex", gap: 6 }}><button className="mini-btn" onClick={() => { setDraft(plan.items); setEditing(false); }}>취소</button><button className="mini-btn" style={{ background: "var(--deep)", color: "#fff" }} disabled={busy === "edit"} onClick={saveEdit}>저장</button></span>
          : <button className="mini-btn" onClick={() => { setDraft(plan.items); setEditing(true); }}>시간 조정·삭제</button>}
      </div>

      <a className="actbtn" href={`/p/${parentToken}/map?kid=1`} target="_blank" rel="noopener noreferrer" style={{ textAlign: "center" }}>🗺 지도에서 동선 보기</a>
      <div className="tl">
        {items.map((it) => {
          const p = it.place_id ? byId.get(it.place_id) : undefined;
          return (
            <div key={it.id} className={`ti ${tone(it, p)}`}>
              <div className="t">{it.start}</div>
              <div className="dot" />
              <div className="box">
                <b>{it.title}</b>
                <small>
                  {[it.walk_min != null ? `도보 ${it.walk_min}분` : null, `${it.start}~${it.end}`, it.kid_note || null].filter(Boolean).join(" · ")}
                </small>
                {p?.fan_type && p.fan_type !== "none" && <span className="tag pk" style={{ marginRight: 4 }}>{FAN_LABEL[p.fan_type]}</span>}
                {sourceTag(it)}
                {it.why && <small style={{ color: "var(--deep)", marginTop: 4 }}>이 장소가 포함된 근거: {it.why}</small>}
                {editing && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <input aria-label="시작" className="inp sm" type="time" value={it.start} style={{ width: 110 }} onChange={(e) => setDraft(draft.map((d) => d.id === it.id ? { ...d, start: e.target.value } : d))} />
                    <span>~</span>
                    <input aria-label="끝" className="inp sm" type="time" value={it.end} style={{ width: 110 }} onChange={(e) => setDraft(draft.map((d) => d.id === it.id ? { ...d, end: e.target.value } : d))} />
                    {it.type !== "show" && it.type !== "enter" && <button className="mini-btn del" onClick={() => setDraft(draft.filter((d) => d.id !== it.id))}>삭제</button>}
                  </div>
                )}
                {!editing && SWAPPABLE.has(it.type) && it.place_id && (!pil || it.type === "meal") && (
                  <div style={{ marginTop: 6 }}><button className="mini-btn" disabled={busy === it.id} onClick={() => swap(it.id)}>{SWAP_LABEL[it.type]}</button></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {plan.trace && plan.trace.length > 0 && (
        <details className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>🤖 AI가 이렇게 짰어요</summary>
          <ol style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {plan.trace.map((t, i) => (
              <li key={i} style={{ fontSize: 14, lineHeight: 1.5 }}><b style={{ color: "var(--deep)" }}>{t.step}</b><br /><span style={{ color: "var(--sub)" }}>{t.detail}</span></li>
            ))}
          </ol>
        </details>
      )}

      {fanPlaces.length > 0 && (
        <>
          <span className="lab" style={{ margin: "4px 0 -6px" }}>{pil ? `오늘 들르는 ${concert.artist_display} 스팟` : "최애 장소"}</span>
          {fanPlaces.map((p) => (
            <div key={p.id} className="fanc">
              <b>{p.name}</b> <span className="tag pk">{FAN_LABEL[p.fan_type]}</span>{(p.origin ?? "concertrip") === "concertrip" && <span className="tag pu" style={{ marginLeft: 4 }}>콘서트립에서 불러옴</span>}
              <p>{p.description_ko || CATEGORY_LABEL[p.category]}{p.walk_min_from_venue != null ? ` · 공연장에서 도보 ${p.walk_min_from_venue}분` : ""}</p>
              <p style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {p.evidence_urls.length > 0 && <span style={{ color: "var(--sub)" }}>근거</span>}
                {p.evidence_urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{sourceName(u)}</a>)}
                {p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer">카카오맵</a>}
                {p.concertrip_url && <a href={p.concertrip_url} target="_blank" rel="noopener noreferrer">콘서트립에서 자세히 보기</a>}
              </p>
            </div>
          ))}
        </>
      )}

      {plan.extra_day && plan.extra_day.place_ids.length > 0 && (
        <div className="stay">
          <b>{plan.extra_day.title || "하루 더 머무신다면?"}</b>
          <p>{plan.extra_day.place_ids.map((id) => byId.get(id)?.name).filter(Boolean).join(", ")}</p>
          <p><span className="tag pu">당일 일정에는 넣지 않았어요</span></p>
        </div>
      )}

      </>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="lab" style={{ margin: 0 }}>보내기 전에 알려 주세요</span>
        <div>
          <span className="lab">부모님께 나는</span>
          <div className="chips">
            {["딸", "아들", "조카"].map((l) => <button key={l} type="button" className="chip" aria-pressed={!labelCustom && share.kid_label === l} onClick={() => { setLabelCustom(false); setShare({ ...share, kid_label: l }); }}>{l}</button>)}
            <button type="button" className="chip" aria-pressed={labelCustom} onClick={() => { setLabelCustom(true); setShare({ ...share, kid_label: "" }); }}>직접 입력</button>
          </div>
          {labelCustom && <input className="inp" style={{ marginTop: 8 }} value={share.kid_label} maxLength={10} onChange={(e) => setShare({ ...share, kid_label: e.target.value })} placeholder="예: 며느리, 손녀" />}
        </div>
        <div className="fld"><span>이름(선택)</span><input className="inp sm" value={share.kid_name} maxLength={20} onChange={(e) => setShare({ ...share, kid_name: e.target.value })} placeholder="예: 희주" /></div>
        <div className="fld"><span>내 연락처(선택)</span><input className="inp sm" inputMode="tel" value={share.kid_phone} maxLength={20} onChange={(e) => setShare({ ...share, kid_phone: e.target.value.replace(/[^0-9\-]/g, "") })} placeholder="010-0000-0000" /></div>
        <p className="fine" style={{ textAlign: "left", margin: 0 }}>연락처를 넣으면 부모님이 물어보기에서 답을 못 받을 때 번호를 글자로 보여 드려요.</p>
        <p className="note" style={{ margin: 0 }}>“{title}”</p>
      </div>

      <div className="row2">
        <button className="kakao" onClick={() => sendKakao(false)}>카카오톡으로<br />보내기</button>
        <button className="ghost" onClick={shareLink}>링크 복사·<br />문자로 보내기</button>
      </div>
      <p className="fine" style={{ margin: "-4px 0 0" }}>문자·밴드로 보내도 {pil ? "여행" : "공연"} 카드 미리보기가 함께 떠요.</p>

      {survey === "open" && (
        <div className="intent" style={{ borderColor: "var(--purple)" }}>
          <b>잠깐! {DAY} 가장 걱정되는 건 뭐예요?</b>
          <p>하나만 골라 주세요. 서비스를 더 낫게 만드는 데 써요.</p>
          <div className="chips">
            {(pil ? ["식사", "쉴 곳", "길 찾기", "가게가 문을 닫았을 때", "화장실", "귀가", "연락이 안 될 때"] : ["식사", "쉴 곳", "길·입구 찾기", "굿즈 줄", "화장실", "귀가", "연락이 안 될 때"]).map((a) => (
              <button key={a} className="chip pu" onClick={() => { track("survey", kidToken, undefined, { q: "worry", answer: a }); ls.set(`tt_survey_${kidToken}`, "1"); setSurvey("done"); }}>{a}</button>
            ))}
          </div>
        </div>
      )}
      {survey === "done" && <p className="note" style={{ margin: 0 }}>답해 주셔서 고마워요!</p>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <b style={{ fontSize: 15 }}>나도 진행 상황 보기</b>
        <p className="note" style={{ textAlign: "left", margin: 0 }}>부모님이 누른 완료 버튼과 질문을 볼 수 있어요. 이 링크를 저장해 두세요.</p>
        <div className="row2">
          <button className="ghost" style={{ minHeight: 48, padding: 10 }} onClick={() => sendKakao(true)}>나에게 카톡으로</button>
          <button className="ghost" style={{ minHeight: 48, padding: 10 }} onClick={() => copy(kidUrl, "kid")}>링크 복사</button>
        </div>
      </div>

      <div className="intent">
        <b>정식 출시되면 3,900원이에요</b>
        <p>지금은 얼리버드라 무료예요. 출시 때 결제하실 생각이 있으면 알려 주세요.</p>
        {intent
          ? <p style={{ color: "var(--deep)", fontWeight: 700 }}>{intent === "yes" ? "고마워요! 출시되면 알려 드릴게요." : "알려 주셔서 고마워요."}</p>
          : <div className="row2"><button className="y" onClick={() => sendIntent("yes")}>출시되면 결제할게요</button><button onClick={() => sendIntent("no")}>괜찮아요</button></div>}
        <p style={{ textAlign: "center" }}>지금 결제되지는 않아요.</p>
      </div>
      <p className="fine">부모님 링크는 {pil ? "여행" : "공연"} 다음 날 23:59까지 열려요. 장소 정보는 콘서트립(concertrip.kr)에서 불러와요.</p>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function ChecklistTab({ items, checks, onToggle }: { items: ReturnType<typeof buildChecklist>; checks: Record<string, boolean>; onToggle: (id: string, v: boolean) => void }) {
  const phases = ["D-7", "D-1", "당일 아침"] as const;
  const done = items.filter((i) => checks[i.id]).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="note" style={{ textAlign: "left", margin: 0 }}>이 일정에 맞춰 만든 준비 목록이에요. {done}/{items.length} 완료</p>
      {phases.map((ph) => (
        <div key={ph} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ color: "var(--deep)" }}>{ph}</b>
          {items.filter((i) => i.phase === ph).map((i) => (
            <label key={i.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, lineHeight: 1.5 }}>
              <input type="checkbox" checked={!!checks[i.id]} onChange={(e) => onToggle(i.id, e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
              <span style={{ textDecoration: checks[i.id] ? "line-through" : "none", color: checks[i.id] ? "var(--sub)" : "inherit" }}>{i.text}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

function TicketTab({ ticket, onSave }: { ticket: TicketInfo; onSave: (t: TicketInfo) => void }) {
  const [t, setT] = useState(ticket);
  const F = (p: Partial<TicketInfo>) => setT((x) => ({ ...x, ...p }));
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <p className="note" style={{ textAlign: "left", margin: "0 0 6px" }}>부모님 화면 &quot;내 티켓&quot; 카드에 큰 글씨로 보여요. 좌석·입구는 일정 정보에서 가져와요.</p>
      <div className="fld"><span>예매처</span><input className="inp sm" value={t.vendor} onChange={(e) => F({ vendor: e.target.value })} placeholder="예: 티켓링크" /></div>
      <div className="fld"><span>티켓 받는 방법</span>
        <select className="inp sm" value={t.pickup} onChange={(e) => F({ pickup: e.target.value as TicketInfo["pickup"] })}>
          <option value="">모름</option><option value="mobile">모바일 티켓</option><option value="onsite">현장 수령</option><option value="paper">종이 티켓(배송)</option>
        </select></div>
      <div className="fld"><span>예매자 이름</span><input className="inp sm" value={t.booker_name} onChange={(e) => F({ booker_name: e.target.value })} placeholder="본인 확인용(선택)" /></div>
      <label className="fld"><span>신분증 확인</span><input type="checkbox" checked={t.id_check} onChange={(e) => F({ id_check: e.target.checked })} style={{ width: 22, height: 22 }} /></label>
      <div className="fld"><span>귀가 버스 호차</span><input className="inp sm" value={t.bus_car} onChange={(e) => F({ bus_car: e.target.value })} placeholder="예: 3호차" /></div>
      <div className="fld"><span>버스 좌석</span><input className="inp sm" value={t.bus_seat} onChange={(e) => F({ bus_seat: e.target.value })} placeholder="예: 12번" /></div>
      <div className="fld"><span>메모</span><input className="inp sm" value={t.note} onChange={(e) => F({ note: e.target.value })} placeholder="예: 버스 앞 유리 '수성 봄날'" /></div>
      <button className="cta" style={{ marginTop: 8 }} onClick={() => onSave(t)}>저장</button>
    </div>
  );
}
