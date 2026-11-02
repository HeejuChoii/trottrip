"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Brand from "./Brand";
import { useKakao } from "./useKakao";
import { postJSON, track } from "@/lib/client";
import { fmtDateKo, fmtTimeKo, isHHMM } from "@/lib/time";
import { shareTitle } from "@/lib/text";
import { CATEGORY_LABEL, FAN_LABEL } from "@/lib/concertrip";
import type { ConcertView, Place, Plan, PlanItem } from "@/lib/types";

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
}

function tone(it: PlanItem) {
  return it.type === "goods" || it.type === "photo" ? "pk" : it.type === "extra" ? "pu" : "";
}

function sourceTag(it: PlanItem) {
  if (!it.place_id && it.source === "needs_check") return <span className="tag in">확인 필요</span>;
  if (it.source === "verified") return <span className="tag ok">공식·현장 확인</span>;
  if (it.source === "needs_check") return <span className="tag in">확인 전 정보</span>;
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
  const [origin, setOrigin] = useState("");
  const kakao = useKakao(kakaoKey);

  useEffect(() => { setOrigin(process.env.NEXT_PUBLIC_SITE_URL || location.origin); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2400); return () => clearTimeout(t); }, [toast]);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const parentUrl = `${origin}/p/${parentToken}`;
  const kidUrl = `${origin}/k/${kidToken}/status`;
  const title = shareTitle(share.kid_label, share.kid_name);
  const desc = `〈${concert.title.replace(/.*〈|〉.*/g, "")}〉 · ${fmtDateKo(concert.date)} · 앱 설치 없이 바로 보세요`;
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
    if (kind === "parent") track("share_copy", kidToken);
  }

  async function sendKakao(toSelf = false) {
    if (!(await saveShare())) return;
    const url = toSelf ? kidUrl : parentUrl;
    if (kakao && window.Kakao) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: toSelf ? "부모님 공연 날 진행 상황" : title,
            description: toSelf ? "누른 버튼과 질문만 보여요. 위치는 보내지 않아요." : desc,
            imageUrl: ogImage,
            link: { mobileWebUrl: url, webUrl: url },
          },
          buttons: [{ title: toSelf ? "진행 상황 보기" : "안내장 열기", link: { mobileWebUrl: url, webUrl: url } }],
        });
        if (!toSelf) track("share_kakao", kidToken);
        return;
      } catch { /* 아래 대체 경로 */ }
    }
    // SDK 실패 → Web Share API → 링크 복사
    if (navigator.share) {
      try { await navigator.share({ title, text: desc, url }); if (!toSelf) track("share_kakao", kidToken, undefined, { fallback: "webshare" }); return; } catch { /* 취소 */ }
    }
    copy(url, toSelf ? "kid" : "parent");
  }

  async function sendEmail() {
    if (!(await saveShare())) return;
    const body = `${props.parentHonorific}, ${title}이에요.\n\n${desc}\n\n아래 링크를 누르시면 공연 날 할 일을 큰 글씨로 보실 수 있어요.\n${parentUrl}\n\n앱을 설치하지 않으셔도 돼요.`;
    track("share_email", kidToken);
    location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
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
      <p className="note" style={{ textAlign: "left", margin: "-4px 0 0" }}>{concert.venue_name} · {fmtDateKo(concert.date)} {fmtTimeKo(concert.start_time)} 시작{props.share && ""}</p>
      {plan.general && <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}><b>이 공연은 장소 정보를 준비 중이에요.</b><br />식사·이동·귀가 시각만 담은 일반 일정이에요. 장소가 준비되면 운영자가 콘서트립에 올려요.</div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="lab" style={{ margin: 0 }}>공연 날 하루</span>
        {editing
          ? <span style={{ display: "flex", gap: 6 }}><button className="mini-btn" onClick={() => { setDraft(plan.items); setEditing(false); }}>취소</button><button className="mini-btn" style={{ background: "var(--deep)", color: "#fff" }} disabled={busy === "edit"} onClick={saveEdit}>저장</button></span>
          : <button className="mini-btn" onClick={() => { setDraft(plan.items); setEditing(true); }}>시간 조정·삭제</button>}
      </div>

      <div className="tl">
        {items.map((it) => {
          const p = it.place_id ? byId.get(it.place_id) : undefined;
          return (
            <div key={it.id} className={`ti ${tone(it)}`}>
              <div className="t">{it.start}</div>
              <div className="dot" />
              <div className="box">
                <b>{it.title}</b>
                <small>
                  {[it.walk_min != null ? `도보 ${it.walk_min}분` : null, `${it.start}~${it.end}`, it.kid_note || null].filter(Boolean).join(" · ")}
                </small>
                {p?.fan_type && p.fan_type !== "none" && <span className="tag pk" style={{ marginRight: 4 }}>{FAN_LABEL[p.fan_type]}</span>}
                {sourceTag(it)}
                {editing && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    <input aria-label="시작" className="inp sm" type="time" value={it.start} style={{ width: 110 }} onChange={(e) => setDraft(draft.map((d) => d.id === it.id ? { ...d, start: e.target.value } : d))} />
                    <span>~</span>
                    <input aria-label="끝" className="inp sm" type="time" value={it.end} style={{ width: 110 }} onChange={(e) => setDraft(draft.map((d) => d.id === it.id ? { ...d, end: e.target.value } : d))} />
                    {it.type !== "show" && it.type !== "enter" && <button className="mini-btn del" onClick={() => setDraft(draft.filter((d) => d.id !== it.id))}>삭제</button>}
                  </div>
                )}
                {!editing && SWAPPABLE.has(it.type) && it.place_id && (
                  <div style={{ marginTop: 6 }}><button className="mini-btn" disabled={busy === it.id} onClick={() => swap(it.id)}>{SWAP_LABEL[it.type]}</button></div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {fanPlaces.length > 0 && (
        <>
          <span className="lab" style={{ margin: "4px 0 -6px" }}>최애 장소</span>
          {fanPlaces.map((p) => (
            <div key={p.id} className="fanc">
              <b>{p.name}</b> <span className="tag pk">{FAN_LABEL[p.fan_type]}</span>
              <p>{p.description_ko || CATEGORY_LABEL[p.category]}{p.walk_min_from_venue != null ? ` · 공연장에서 도보 ${p.walk_min_from_venue}분` : ""}</p>
              <p style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {p.evidence_urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">근거 {i + 1}</a>)}
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
        <button className="ghost" onClick={sendEmail}>이메일로<br />보내기</button>
      </div>
      <button className="linkbtn" onClick={() => copy(parentUrl, "parent")}>링크 복사</button>

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
      <p className="fine">부모님 링크는 공연 다음 날 23:59까지 열려요. 장소 정보는 콘서트립(concertrip.kr)에서 불러와요.</p>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
