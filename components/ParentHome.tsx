"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Brand from "./Brand";
import { clientNow, ls, track } from "@/lib/client";
import { absEnd, absMin, addDays, daysBetween, fmtDateLongKo, fmtShort, fmtTimeKo, toMin, isHHMM } from "@/lib/time";
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
  placeNames: Record<string, { name: string; walk: number | null; lat?: number | null; lng?: number | null; fan?: boolean }>;
  stepsLine: string;
  kit: string[];
  concertLine: string; // "코엑스 D홀 · 오후 5시 시작"
  /** 공연 없는 성지순례 여행 */
  pilgrim?: boolean;
  /** 가수 이름(팬덤 스팟 여행 버튼 문구) */
  artist?: string;
  /** 공연(또는 가수) 포스터 이미지 */
  poster?: string | null;
}

/** 물어보기 챗봇: 부모님 화면 어디서나 오른쪽 아래 동그라미 */
export function AskFab({ token }: { token: string }) {
  return (
    <Link href={`/p/${token}/ask`} className="fab" aria-label="물어보기">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <line x1="24" y1="7" x2="24" y2="12.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="24" cy="6" r="2.7" fill="#fff" />
        <rect x="7" y="18" width="5" height="9" rx="2.5" fill="#fff" />
        <rect x="36" y="18" width="5" height="9" rx="2.5" fill="#fff" />
        <rect x="11" y="12" width="26" height="21" rx="9" fill="#fff" />
        <path d="M16 31 L14.5 39 L23.5 32.5 Z" fill="#fff" />
        <rect x="15" y="16" width="18" height="13" rx="5.5" fill="#fa2d48" />
        <circle cx="20" cy="21.2" r="1.9" fill="#fff" />
        <circle cx="28" cy="21.2" r="1.9" fill="#fff" />
        <path d="M20.5 24.6 Q24 27.4 27.5 24.6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

/** 아래 메뉴: 안내장 · 일정·지도(팬덤 여행은 지도) · 공연장(내 티켓 포함) — 물어보기는 동그란 버튼으로 따로 */
export function BottomBar({ token, pilgrim, current }: { token: string; pilgrim?: boolean; current?: "home" | "map" | "venue" | "ask" }) {
  return (
    <>
      {current !== "ask" && <AskFab token={token} />}
      <nav className="bbar" aria-label="부모님 메뉴">
        <Link href={`/p/${token}`} className={current === "home" ? "on" : ""}>안내장</Link>
        {/* 공연 날은 가운데 탭이 동선 지도 + 전체 일정, 팬덤 여행은 그 화면이 오른쪽 '여행 일정'이라 가운데는 지도 */}
        <Link href={pilgrim ? `/p/${token}/map` : `/p/${token}/plan`} className={current === "map" ? "on" : ""}>{pilgrim ? "지도" : "일정·지도"}</Link>
        <Link href={`/p/${token}/venue`} className={current === "venue" ? "on" : ""}>{pilgrim ? "여행 일정" : "공연장·티켓"}</Link>
      </nav>
    </>
  );
}

/** 지금 할 일 아래 바로 가기 버튼: 숙소 등 링크, 길찾기, 택시 구간이면 카카오맵 택시·길찾기 */
function Actions({ it, place, token }: { it: PlanItem; place?: { name: string; lat?: number | null; lng?: number | null }; token: string }) {
  const taxi = /택시/.test(it.parent_text);
  const ll = place?.lat != null && place?.lng != null;
  if (!it.link && !(it.place_id && ll)) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {it.link && <a className="actbtn" href={it.link.url} target="_blank" rel="noopener noreferrer">{it.link.label}</a>}
      {it.place_id && ll && taxi && (
        <a className="actbtn" href={`https://map.kakao.com/link/to/${encodeURIComponent(place!.name)},${place!.lat},${place!.lng}`} target="_blank" rel="noopener noreferrer">🚕 택시·길찾기 (카카오맵)</a>
      )}
      {it.place_id && ll && !taxi && <Link className="actbtn" href={`/p/${token}/map?place=${encodeURIComponent(it.place_id)}&route=1`}>🧭 길찾기</Link>}
    </div>
  );
}

/** 핑크 카드: 굿즈·포토존·입장, 그리고 가수가 다녀간 곳(팬덤 스팟·가수 방문 식당)이면 종류와 상관없이 */
function isPink(it: PlanItem, places: Props["placeNames"]) {
  return it.type === "goods" || it.type === "photo" || it.type === "enter" || it.type === "show" || (!!it.place_id && !!places[it.place_id]?.fan);
}

function mainTitle(it: PlanItem) {
  // 팬덤 스팟 여행: "임영웅 스팟 · 콩마루 (포천 군내면)" → "콩마루"
  const m = it.title.match(/^\S+ 스팟 · (.+)$/);
  if (m) return m[1].replace(/\s*\(.*\)$/, "");
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
  const DAY = p.pilgrim ? "여행 날" : "공연 날";

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

  const items = useMemo(() => [...plan.items].sort((a, b) => absMin(a) - absMin(b)), [plan.items]);
  const ret = items.find((i) => i.type === "return");

  if (!now) return <main className="shell pv"><div className="top"><Brand href={null} /></div></main>;

  // 여러 날 일정(1박): 공연 날 0시 기준 절대 분으로 비교한다
  const lastDay = Math.max(1, ...items.map((i) => i.day ?? 1));
  const diff = daysBetween(p.concertDate, now.date);
  const rel = diff < 0 ? "before" : diff >= lastDay ? "after" : "today";
  const minNow = rel === "before" ? -1 : rel === "after" ? lastDay * 1440 + 1 : diff * 1440 + now.min;
  const remaining = items.filter((i) => !done.has(i.id) && (rel === "before" || absEnd(i) > minNow || i.type === "return"));
  const current = remaining[0] ?? null;
  const showEndMin = isHHMM(p.showEnd) ? toMin(p.showEnd) : Infinity;
  /** 아직 그날이 오지 않은 둘째 날 일정이면 "다음 날"을 붙인다 */
  const dayPre = (i: PlanItem) => ((i.day ?? 1) > 1 && (rel === "before" || diff < (i.day ?? 1) - 1) ? "다음 날 " : "");
  // 귀가 화면: 마지막 귀가 카드 차례가 됐을 때(당일 귀가면 공연이 끝난 뒤에도)
  const returnMode = !!ret && !done.has(ret.id) && rel !== "before" && (current?.id === ret.id || ((ret.day ?? 1) === 1 && minNow >= showEndMin));
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

      </div>
    </>
  );

  // F18 P0 안내장 표지: 공연 날 전에는 이 화면이 첫 화면
  if (rel === "before" && !preview && !askedId) {
    const glance = items.filter((i) => (p.pilgrim ? ["arrive", "meal", "photo", "return"] : ["arrive", "meal", "goods", "enter", "return"]).includes(i.type)).slice(0, p.pilgrim ? 6 : 5);
    return (
      <main className="shell pv">
        <div className="top"><Brand href={null} /></div>
        <p className="hello">{p.honorific}, {kidH}이 보낸 {p.pilgrim ? "팬덤 스팟 여행" : "공연 날"} 안내장이에요</p>
        {p.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.poster} alt={p.pilgrim ? `${p.artist ?? ""} 사진` : "공연 포스터"} referrerPolicy="no-referrer" style={p.pilgrim ? { width: "100%", height: 260, objectFit: "cover", objectPosition: "center 25%", borderRadius: 18 } : { width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 18, background: "#fff" }} />
        )}
        <section className="next pk">
          <div className="k">{fmtDateLongKo(p.concertDate)}</div>
          <div className="w">{p.concertTitle}</div>
          <div className="d">{p.concertLine}</div>
        </section>
        <div className="card">
          <b style={{ fontSize: 19 }}>하루 한눈에</b>
          <div className="mini" style={{ marginTop: 8 }}>
            {glance.map((i) => <div key={i.id} className="mi"><span>{mainTitle(i)}</span><b>{dayPre(i)}{fmtShort(i.start)}</b></div>)}
          </div>
        </div>
        <div className="card" style={{ fontSize: 18, lineHeight: 1.5 }}>
          <b>👟 얼마나 움직이세요?</b><br />{p.stepsLine.replace(/^오늘 /, "")}
        </div>
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>🎒 챙기실 것</b><br />{p.kit.join(" · ")}
        </div>
        <div className="ai"><p style={{ marginTop: 0 }}>{DAY} 이 링크를 열면 <b>지금 할 일</b>을 하나씩 알려 드려요. 앱 설치는 필요 없어요.</p></div>
        <Link href={`/p/${token}/venue`} className="bigbtn line">{p.pilgrim ? `📍 ${p.artist ?? ""} 팬덤 여행 일정 보기`.replace("  ", " ") : "🎫 내 티켓·공연장 보기"}</Link>
        <button className="bigbtn pk" style={{ fontSize: 19, padding: 14 }} onClick={() => setPreview(true)}>{DAY} 화면 미리 보기</button>
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
    const left = absMin(ret) - minNow;
    const place = ret.place_id ? p.placeNames[ret.place_id] : undefined;
    return (
      <main className="shell pv">
        <div className="top"><Brand href={null} /><span style={{ fontSize: 16, color: "var(--sub)" }}>{p.pilgrim ? "오늘 일정 끝" : "공연이 끝났어요"}</span></div>
        {askedCard}
        <h1 className="h">{ret.title.startsWith("숙소") ? "숙소로 가실 시간이에요" : "집에 가실 시간이에요"}</h1>
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
        <Actions it={ret} place={place} token={token} />
        <div className="kid"><div className="av">{p.kidLabel.slice(0, 2) || "자녀"}</div><div>버튼을 누르시면 {kidH}께 바로 알려 드려요</div></div>
        <BottomBar token={token} pilgrim={p.pilgrim} current="home" />
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
        <Feedback token={token} pilgrim={p.pilgrim} />
        <div className="mini">
          {items.filter((i) => i.type !== "show").map((i) => <div key={i.id} className="mi past"><span>{mainTitle(i)}</span><b>{done.has(i.id) ? "완료" : fmtShort(i.start)}</b></div>)}
        </div>
        <BottomBar token={token} pilgrim={p.pilgrim} current="home" />
      </main>
    );
  }

  const cur = current!;
  // 일정 목록은 늘 시간순: 지금 할 일보다 이른 것(끝낸 것 포함)은 위에 연하게, 늦은 것은 아래에
  const row = (list: PlanItem[], label: string) => list.length ? (
    <div className="mini" aria-label={label}>
      {list.map((i) => {
        const past = done.has(i.id) || (rel === "today" && absEnd(i) <= minNow && i.type !== "return") || rel === "after";
        return (
          <div key={i.id} className={`mi ${past ? "past" : ""} ${isPink(i, p.placeNames) ? "pk" : ""}`}>
            <span>{mainTitle(i)}</span><b>{done.has(i.id) ? "완료" : `${dayPre(i)}${fmtShort(i.start)}`}</b>
          </div>
        );
      })}
    </div>
  ) : null;
  const curPlace = cur.place_id ? p.placeNames[cur.place_id] : undefined;
  const started = rel === "today" && absMin(cur) <= minNow;
  const pink = isPink(cur, p.placeNames);

  return (
    <main className="shell pv">
      {header}
      <p className="hello">{p.honorific}, 즐거운 {p.pilgrim ? "여행" : "공연 여행"} 되세요</p>
      {firstOpen && (
        <div className="kid" role="note">
          <div className="av">{p.kidLabel.slice(0, 2) || "자녀"}</div>
          <div>{kidH}이 보낸 안내장이에요. 앱 설치 없이 이 화면만 보시면 돼요.
            <button className="linkbtn" style={{ padding: "4px 0", fontSize: 15 }} onClick={() => setFirstOpen(false)}>알겠어요</button></div>
        </div>
      )}
      {askedCard}
      {rel === "before" && (
        <div className="card" style={{ fontSize: 17, lineHeight: 1.5 }}>{DAY}은 <b>{fmtDateLongKo(p.concertDate)}</b>이에요. 그날 이 화면을 열면 지금 할 일을 순서대로 알려 드려요.</div>
      )}
      {row(items.filter((i) => i.id !== cur.id && i.type !== "show" && absMin(i) < absMin(cur)), "지난 일정")}
      <section className={`next ${pink ? "pk" : ""}`} aria-live="polite">
        <div className="k">{rel === "before" ? `${DAY} 처음 할 일` : started ? "지금 할 일" : "다음 할 일"}</div>
        <div className="w">{mainTitle(cur)}</div>
        <div className="d">
          {curPlace ? `${curPlace.name} · ` : ""}{cur.parent_text}
          {cur.walk_min != null && cur.walk_min > 0 && !/택시/.test(cur.parent_text) ? ` 걸어서 ${cur.walk_min}분.` : ""}
        </div>
        <span className="when">{started ? `${fmtTimeKo(cur.end)}까지` : `${dayPre(cur)}${fmtTimeKo(cur.start)}부터`}</span>
      </section>
      {(cur.type !== "show" || started) && <button className="bigbtn ok" disabled={busy} onClick={() => complete(cur)}>{cur.done_label || "했어요"} ✓</button>}
      <Actions it={cur} place={curPlace} token={token} />
      {row(items.filter((i) => i.id !== cur.id && i.type !== "show" && absMin(i) >= absMin(cur)), "남은 일정")}
      <Link className="bigbtn pk" href={`/p/${token}/change`} style={{ fontSize: 19, padding: 14 }}>일정 바꾸기</Link>
      <BottomBar token={token} pilgrim={p.pilgrim} current="home" />
    </main>
  );
}

/** v1.2 수요 근거: 귀가 후 만족도 한 번 누르기 */
function Feedback({ token, pilgrim }: { token: string; pilgrim?: boolean }) {
  const [sent, setSent] = useState<string | null>(() => ls.get(`tt_fb_${token}`));
  if (sent) return <div className="ai"><p style={{ marginTop: 0 }}>알려 주셔서 고마워요. 즐거운 {pilgrim ? "여행" : "공연"} 되셨기를 바라요!</p></div>;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ fontSize: 20 }}>오늘 하루 어떠셨어요?</b>
      {[["good", "😊 좋았어요"], ["ok", "🙂 괜찮았어요"], ["hard", "😥 조금 힘들었어요"]].map(([v, l]) => (
        <button key={v} className="bigbtn line" style={{ fontSize: 20, padding: 14 }} onClick={() => { track("feedback", token, undefined, { answer: v }); ls.set(`tt_fb_${token}`, v); setSent(v); }}>{l}</button>
      ))}
    </div>
  );
}
