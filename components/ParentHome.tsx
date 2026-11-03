"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Brand from "./Brand";
import { clientNow, ls, track } from "@/lib/client";
import { fmtDateLongKo, fmtShort, fmtTimeKo, toMin, isHHMM } from "@/lib/time";
import { kidHonorific } from "@/lib/text";
import type { Plan, PlanItem } from "@/lib/types";

interface Props {
  token: string;
  plan: Plan;
  concertDate: string;
  concertTitle: string;
  showEnd: string;
  honorific: string;
  kidLabel: string;
  done: string[];
  opened: boolean;
  placeNames: Record<string, { name: string; walk: number | null }>;
  stepsLine: string;
  kit: string[];
  concertLine: string; // "코엑스 D홀 · 오후 5시 시작"
}

export function BottomBar({ token }: { token: string }) {
  return (
    <nav className="bbar" aria-label="부모님 메뉴">
      <Link href={`/p/${token}/map`}>지도</Link>
      <Link href={`/p/${token}/venue`}>공연장</Link>
      <Link href={`/p/${token}/ask`} className="ask">물어보기</Link>
    </nav>
  );
}

function mainTitle(it: PlanItem) {
  return it.title.split(" · ")[0];
}

export default function ParentHome(p: Props) {
  const { token, plan } = p;
  const [done, setDone] = useState(() => new Set(p.done));
  const [now, setNow] = useState<{ date: string; min: number } | null>(null);
  const [firstOpen, setFirstOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askedId, setAskedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false); // 공연 전: 표지(P0) 대신 당일 화면 미리 보기
  const kidH = kidHonorific(p.kidLabel);

  useEffect(() => {
    setAskedId(new URLSearchParams(location.search).get("item")); // 물어보기에서 "일정에서 보기"로 온 경우
    const tick = () => setNow(clientNow());
    tick();
    const t = setInterval(tick, 30000);
    const key = `tt_open_${token}`;
    if (!p.opened && !ls.get(key)) setFirstOpen(true);
    if (!ls.get(key)) { ls.set(key, "1"); track("parent_open", token); }
    return () => clearInterval(t);
  }, [token, p.opened]);

  const items = useMemo(() => [...plan.items].sort((a, b) => toMin(a.start) - toMin(b.start)), [plan.items]);
  const ret = items.find((i) => i.type === "return");

  if (!now) return <main className="shell pv"><div className="top"><Brand href={null} /></div></main>;

  const rel = now.date < p.concertDate ? "before" : now.date > p.concertDate ? "after" : "today";
  const minNow = rel === "before" ? -1 : rel === "after" ? 24 * 60 + 1 : now.min;
  const remaining = items.filter((i) => !done.has(i.id) && (rel === "before" || toMin(i.end) > minNow || i.type === "return"));
  const current = remaining[0] ?? null;
  const showEndMin = isHHMM(p.showEnd) ? toMin(p.showEnd) : Infinity;
  const returnMode = !!ret && !done.has(ret.id) && rel !== "before" && (minNow >= showEndMin || current?.id === ret.id);
  const finished = !current || (ret && done.has(ret.id) && rel !== "before");

  async function complete(it: PlanItem) {
    setBusy(true);
    setDone((d) => new Set(d).add(it.id));
    await track(it.type === "return" ? "boarded" : "done", token, it.id);
    setBusy(false);
    scrollTo(0, 0);
  }

  const header = (
    <>
      <div className="top"><Brand href={null} /><span style={{ fontSize: 16, color: "var(--sub)" }}>{fmtDateLongKo(p.concertDate)}</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, color: "var(--sub)" }}>👟 {p.stepsLine.split(" · ")[0]}</span>
        <Link href={`/p/${token}/ticket`} className="mini-btn" style={{ fontSize: 17, padding: "10px 14px", textDecoration: "none" }}>🎫 내 티켓</Link>
      </div>
    </>
  );

  // F18 P0 안내장 표지: 공연 날 전에는 이 화면이 첫 화면
  if (rel === "before" && !preview && !askedId) {
    const glance = items.filter((i) => ["arrive", "meal", "goods", "enter", "return"].includes(i.type)).slice(0, 5);
    return (
      <main className="shell pv">
        <div className="top"><Brand href={null} /></div>
        <p className="hello">{p.honorific}, {kidH}이 보낸 공연 날 안내장이에요</p>
        <section className="next pk">
          <div className="k">{fmtDateLongKo(p.concertDate)}</div>
          <div className="w">{p.concertTitle}</div>
          <div className="d">{p.concertLine}</div>
        </section>
        <div className="card">
          <b style={{ fontSize: 19 }}>하루 한눈에</b>
          <div className="mini" style={{ marginTop: 8 }}>
            {glance.map((i) => <div key={i.id} className="mi"><span>{mainTitle(i)}</span><b>{fmtShort(i.start)}</b></div>)}
          </div>
        </div>
        <div className="card" style={{ fontSize: 18, lineHeight: 1.5 }}>
          <b>👟 얼마나 움직이세요?</b><br />{p.stepsLine.replace(/^오늘 /, "")}
        </div>
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>🎒 챙기실 것</b><br />{p.kit.join(" · ")}
        </div>
        <div className="ai"><p style={{ marginTop: 0 }}>공연 날 이 링크를 열면 <b>지금 할 일</b>을 하나씩 알려 드려요. 앱 설치는 필요 없어요.</p></div>
        <Link href={`/p/${token}/ticket`} className="bigbtn line">🎫 내 티켓 보기</Link>
        <button className="bigbtn pk" style={{ fontSize: 19, padding: 14 }} onClick={() => setPreview(true)}>공연 날 화면 미리 보기</button>
      </main>
    );
  }

  // 물어보기에서 "일정에서 보기"로 온 항목 (모든 화면 상단)
  const askedCard = (() => {
        const a = askedId ? items.find((i) => i.id === askedId) : undefined;
        if (!a) return null;
        const ap = a.place_id ? p.placeNames[a.place_id] : undefined;
        return (
          <section className="asked" aria-label="물어보신 일정">
            <div className="k">물어보신 일정</div>
            <div className="w">{fmtTimeKo(a.start)} · {mainTitle(a)}</div>
            <div className="d">{ap ? `${ap.name} · ` : ""}{a.parent_text}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {a.place_id && <Link className="actbtn" style={{ flex: 1, textAlign: "center" }} href={`/p/${token}/map?place=${encodeURIComponent(a.place_id)}&route=1`}>🧭 길찾기</Link>}
              <button className="mini-btn" style={{ fontSize: 16, padding: "0 14px" }} onClick={() => { setAskedId(null); history.replaceState(null, "", location.pathname); }}>닫기</button>
            </div>
          </section>
        );
  })();

  // P4 귀가 안내
  if (returnMode && ret) {
    const left = toMin(ret.start) - minNow;
    const place = ret.place_id ? p.placeNames[ret.place_id] : undefined;
    return (
      <main className="shell pv">
        <div className="top"><Brand href={null} /><span style={{ fontSize: 16, color: "var(--sub)" }}>공연이 끝났어요</span></div>
        {askedCard}
        <h1 className="h">집에 가실 시간이에요</h1>
        <div className="home">
          <div className="k">{ret.title}</div>
          <div className="w">{place?.name ?? ret.title}</div>
          <div className="d">{ret.parent_text}{place?.walk != null ? ` 걸어서 ${place.walk}분이에요.` : ""}</div>
        </div>
        <div className="count" aria-live="polite">
          {left > 0 ? `${left}분` : "지금 출발"}
          <small>출발까지 남은 시간 · {fmtTimeKo(ret.start)}</small>
        </div>
        <button className="bigbtn ok" disabled={busy} onClick={() => complete(ret)}>{ret.done_label} ✓</button>
        <div className="kid"><div className="av">{p.kidLabel.slice(0, 2) || "자녀"}</div><div>버튼을 누르시면 {kidH}께 바로 알려 드려요</div></div>
        <BottomBar token={token} />
      </main>
    );
  }

  if (finished) {
    return (
      <main className="shell pv">
        {header}
        {askedCard}
        <h1 className="h">오늘 일정을 다 마치셨어요</h1>
        <p className="hello">조심히 들어가세요. {kidH}께도 알려 드렸어요.</p>
        <div className="mini">
          {items.filter((i) => i.type !== "show").map((i) => <div key={i.id} className="mi past"><span>{mainTitle(i)}</span><b>{done.has(i.id) ? "완료" : fmtShort(i.start)}</b></div>)}
        </div>
        <BottomBar token={token} />
      </main>
    );
  }

  const cur = current!;
  const curPlace = cur.place_id ? p.placeNames[cur.place_id] : undefined;
  const started = rel === "today" && toMin(cur.start) <= minNow;
  const pink = cur.type === "goods" || cur.type === "photo";

  return (
    <main className="shell pv">
      {header}
      <p className="hello">{p.honorific}, 즐거운 공연 여행 되세요</p>
      {firstOpen && (
        <div className="kid" role="note">
          <div className="av">{p.kidLabel.slice(0, 2) || "자녀"}</div>
          <div>{kidH}이 보낸 안내장이에요. 앱 설치 없이 이 화면만 보시면 돼요.
            <button className="linkbtn" style={{ padding: "4px 0", fontSize: 15 }} onClick={() => setFirstOpen(false)}>알겠어요</button></div>
        </div>
      )}
      {askedCard}
      {rel === "before" && (
        <div className="card" style={{ fontSize: 17, lineHeight: 1.5 }}>공연 날은 <b>{fmtDateLongKo(p.concertDate)}</b>이에요. 그날 이 화면을 열면 지금 할 일을 순서대로 알려 드려요.</div>
      )}
      <section className={`next ${pink ? "pk" : ""}`} aria-live="polite">
        <div className="k">{rel === "before" ? "공연 날 처음 할 일" : started ? "지금 할 일" : "다음 할 일"}</div>
        <div className="w">{mainTitle(cur)}</div>
        <div className="d">
          {curPlace ? `${curPlace.name} · ` : ""}{cur.parent_text}
          {cur.walk_min != null && cur.walk_min > 0 && !/택시/.test(cur.parent_text) ? ` 걸어서 ${cur.walk_min}분.` : ""}
        </div>
        <span className="when">{started ? `${fmtTimeKo(cur.end)}까지` : `${fmtTimeKo(cur.start)}부터`}</span>
      </section>
      {cur.type !== "show" && <button className="bigbtn ok" disabled={busy} onClick={() => complete(cur)}>{cur.done_label || "했어요"} ✓</button>}
      <div className="mini" aria-label="오늘 일정">
        {items.filter((i) => i.id !== cur.id && i.type !== "show").map((i) => {
          const past = done.has(i.id) || (rel === "today" && toMin(i.end) <= minNow && i.type !== "return") || rel === "after";
          return (
            <div key={i.id} className={`mi ${past ? "past" : ""} ${i.type === "goods" || i.type === "photo" || i.type === "enter" ? "pk" : ""}`}>
              <span>{mainTitle(i)}</span><b>{done.has(i.id) ? "완료" : fmtShort(i.start)}</b>
            </div>
          );
        })}
      </div>
      <Link className="bigbtn pk" href={`/p/${token}/change`} style={{ fontSize: 19, padding: 14 }}>일정 바꾸기</Link>
      <BottomBar token={token} />
    </main>
  );
}
