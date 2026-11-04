"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import { captureSrc, clientId, ls, postJSON, ss, track } from "@/lib/client";
import { fmtDateKo, fmtTimeKo, toMin, toHHMM } from "@/lib/time";
import type { Concert, ParentProfile, Prefs, Transport } from "@/lib/types";
import { shortTitle } from "@/lib/planner";
import { eunNeun } from "@/lib/text";

type C = Concert & { place_count: number };
export interface CourseCard { id: string; artist: string; title: string; region: string; blurb: string; start: string; spots: { name: string; kind: string }[] }
export interface ArtistCard { name: string; fandom: string; color: string; blurb: string }

function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "pk" | "pu" }) {
  return <button type="button" className={`chip ${tone ?? ""}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}

function Prog({ n }: { n: number }) {
  return <div className="prog" aria-label={`${n}/3 단계`}>{[1, 2, 3].map((i) => <span key={i} className={i <= n ? "on" : ""} />)}</div>;
}

const HONORIFICS = ["어머니", "아버지", "두 분"];

/** 다가오는 토요일 (오늘이 토요일이면 다음 주) */
function nextSaturday(): string {
  const d = new Date(Date.now() + 9 * 3600000);
  const add = ((6 - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

export default function Wizard({ concerts, artists = [], courses = [], initialMode = "concert" }: { concerts: C[]; artists?: ArtistCard[]; courses?: CourseCard[]; initialMode?: "concert" | "fan" }) {
  const router = useRouter();
  // 공연 보러 가세요 / 공연 없이 성지순례 여행
  const [mode, setMode] = useState<"concert" | "fan">(initialMode);
  const fanMode = mode === "fan";
  const [artist, setArtist] = useState(artists[0]?.name ?? "");
  const [courseId, setCourseId] = useState(courses.find((c) => c.artist === artists[0]?.name)?.id ?? "");
  const [tripDate, setTripDate] = useState(nextSaturday);
  const [tripStart, setTripStart] = useState("10:00");
  const course = courses.find((c) => c.id === courseId) ?? null;
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  // 요구사항 정제: 입력이 모호하면 일정을 만들기 전에 한 가지만 되묻는다(F5)
  const [clarify, setClarify] = useState<null | { key: "drop_point" | "return_time" | "train_arrive"; q: string; hint: string; fallback: string }>(null);
  const [clarified, setClarified] = useState(false);
  const [loadStage, setLoadStage] = useState(0);
  useEffect(() => {
    if (step !== 4) { setLoadStage(0); return; }
    const t = setInterval(() => setLoadStage((x) => Math.min(x + 1, 4)), 2200);
    return () => clearInterval(t);
  }, [step]);
  const [concertId, setConcertId] = useState<string | null>(concerts[0]?.id ?? null);
  const [custom, setCustom] = useState({ title: "", venue_name: "", date: "", start_time: "" });
  const [useCustom, setUseCustom] = useState(concerts.length === 0);
  const [seat, setSeat] = useState("");
  const [honorCustom, setHonorCustom] = useState(false);
  const [parent, setParent] = useState<ParentProfile>({
    honorific: "어머니", age_band: "60s", walk: "15-30", steps_usual: 0, rest_often: false, near_toilet: false, elevator_first: false,
    food: ["korean"], food_other: "", medicine_time: "", friends_fitness: "same",
  });
  const [prefs, setPrefs] = useState<Prefs>({ goods: true, photo: true, artist_places: false, fan_first: false, sightseeing: false });
  const [tr, setTr] = useState<Transport>({
    mode: "fan_bus", origin: "", companions: "friends", friends_count: 2,
    meet_place: "", meet_time: "", drop_point: "", return_time: "", return_place: "",
    train_from: "", train_to: "", train_depart: "", train_arrive: "", train_return_depart: "",
    shuttle_info: "", stay: "day",
  });

  useEffect(() => {
    captureSrc();
    if (!ls.get("tt_started")) { ls.set("tt_started", "1"); track("start", undefined, undefined, { cid: clientId(), src: ls.get("tt_src") ?? "" }); }
    if (!ss.get("tt_consent")) router.replace("/");
  }, [router]);

  const concert = useMemo(() => concerts.find((c) => c.id === concertId) ?? null, [concerts, concertId]);
  const who = parent.honorific || "부모님";
  const P = (patch: Partial<ParentProfile>) => setParent((p) => ({ ...p, ...patch }));
  const T = (patch: Partial<Transport>) => setTr((t) => ({ ...t, ...patch }));
  const toggleFood = (f: string) => P({ food: parent.food.includes(f) ? parent.food.filter((x) => x !== f) : [...parent.food, f] });
  const startTime = fanMode ? tripStart : useCustom ? custom.start_time : concert?.start_time ?? "";
  const city = fanMode ? course?.region ?? "" : useCustom ? "" : concert?.city ?? "";

  function next1() {
    if (fanMode) {
      if (!course) return setErr("코스를 골라 주세요.");
      if (!tripDate) return setErr("날짜를 골라 주세요.");
      if (tr.mode !== "train" && tr.mode !== "car") T({ mode: "car" });
      setErr(""); setStep(2); scrollTo(0, 0); return;
    }
    if (useCustom) {
      if (!custom.title || !custom.venue_name || !custom.date || !custom.start_time) return setErr("공연명·공연장·날짜·시작 시각을 모두 넣어 주세요.");
    } else if (!concert) return setErr("공연을 골라 주세요.");
    setErr(""); setStep(2); scrollTo(0, 0);
  }

  function needClarify(): typeof clarify {
    if (fanMode) return tr.mode === "train" && !tr.train_arrive ? { key: "train_arrive", q: "열차·버스는 몇 시에 도착하나요?", hint: "", fallback: "" } : null;
    if (tr.mode === "fan_bus" && !tr.drop_point.trim()) return { key: "drop_point", q: "팬 모임 버스는 어디에 내려 드리나요?", hint: "예: 코엑스 동문 앞", fallback: "공연장 앞" };
    if (tr.mode === "fan_bus" && !tr.return_time) return { key: "return_time", q: "귀가 버스는 몇 시에 출발하나요?", hint: "", fallback: "" };
    if (tr.mode === "train" && !tr.train_arrive) return { key: "train_arrive", q: "열차는 몇 시에 도착하나요?", hint: "", fallback: "" };
    return null;
  }

  async function submit() {
    const c = clarified ? null : needClarify();
    if (c) { setClarify(c); setClarified(true); scrollTo(0, 0); return; }
    setClarify(null);
    setErr(""); setStep(4); scrollTo(0, 0);
    const consent = JSON.parse(ss.get("tt_consent") || "{}");
    try {
      const r = await postJSON<{ kid_token: string }>("/api/trips", {
        concert_id: fanMode || useCustom ? null : concertId,
        custom_concert: !fanMode && useCustom ? custom : null,
        pilgrimage: fanMode ? { course_id: courseId, date: tripDate, start_time: tripStart } : null,
        parent_profile: parent, prefs: fanMode ? { goods: false, photo: false, artist_places: true, fan_first: true, sightseeing: false } : prefs,
        transport: { ...tr, companions: tr.mode === "fan_bus" ? "fan_bus" : tr.companions },
        seat, src: ls.get("tt_src") ?? "", privacy_ok: !!consent.privacy, marketing_opt_in: !!consent.marketing,
      });
      router.push(`/k/${r.kid_token}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "일정을 만들지 못했어요. 입력을 확인하고 다시 눌러 주세요.");
      setStep(3);
    }
  }

  if (clarify) {
    const isTime = clarify.key !== "drop_point";
    const val = tr[clarify.key];
    return (
      <main className="shell">
        <div className="top"><button className="back" onClick={() => { setClarify(null); setClarified(false); }}>← 이전</button><Prog n={3} /></div>
        <h1 className="h">하나만 더 여쭤볼게요</h1>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ fontSize: 17 }}>{clarify.q}</b>
          <input className="inp" type={isTime ? "time" : "text"} value={val} placeholder={clarify.hint} onChange={(e) => T({ [clarify.key]: e.target.value } as Partial<Transport>)} />
          <p className="fine" style={{ textAlign: "left", margin: 0 }}>{isTime ? "모르시면 공연이 끝나고 30분 뒤로 잡아 둘게요." : `모르시면 "${clarify.fallback}"으로 잡아 둘게요.`}</p>
        </div>
        <button className="cta" onClick={submit}>{val ? "이대로 만들기" : "모르겠어요, 그냥 만들기"}</button>
      </main>
    );
  }

  if (step === 4) {
    const S = toMin(startTime);
    return (
      <main className="shell">
        <div className="top"><Brand href={null} /></div>
        <div className="load" aria-live="polite">
          <div className="spin" aria-hidden="true" />
          <h1 className="h" style={{ fontSize: 22 }}>{who}께 맞는 하루를<br />짜고 있어요</h1>
          <div className="steps">
            {(fanMode ? [
              `① 입력 정리 · ${course?.artist ?? ""} 팬덤 스팟 · ${fmtTimeKo(tripStart)} 출발, ${parent.walk === "15-" ? "여유로운" : parent.walk === "15-30" ? "적당한" : "넉넉한"} 걷기`,
              `② 콘서트립에서 팬덤 스팟 ${course?.spots.length ?? 0}곳 불러오기`,
              `③ 동선 최적화 · 가까운 곳부터, 걷기 ${parent.walk === "15-" ? "5분" : parent.walk === "15-30" ? "10분" : "15분"} 넘으면 택시`,
              `④ 식성에 맞는 가수 단골집으로 점심${parent.food.length ? "" : ""}`,
              "⑤ AI가 안내 문장을 쓰고 규칙 검사",
            ] : [
              `① 입력 정리 · ${fmtTimeKo(startTime)} 공연, ${parent.walk === "15-" ? "여유로운" : parent.walk === "15-30" ? "적당한" : "넉넉한"} 걷기`,
              `② 시간 역산 · ${isNaN(S) ? "입장" : `${toHHMM(S - 40)} 입장`}부터 거꾸로 배치`,
              `③ 후보 거르기 · ${parent.walk === "15-" ? "걸어서 5분" : parent.walk === "15-30" ? "걸어서 10분" : "걸어서 15분"} 이내${parent.food.length ? " · 식성에 맞는 식당" : ""}`,
              "④ AI가 장소를 고르고 안내 문장을 써요",
              "⑤ 규칙 검사 · 목록 밖 장소·시각 겹침 확인",
            ]).map((t, i) => <div key={i} className={i < loadStage ? "ok" : ""} style={{ opacity: i <= loadStage ? 1 : 0.45 }}>{t}</div>)}
          </div>
          <p className="fine">15초 정도 걸려요.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      {step === 1 && (
        <>
          <div className="top"><Brand /><Prog n={1} /></div>
          <div className="chips" role="tablist" style={{ marginBottom: -4 }}>
            <button type="button" role="tab" className="chip" aria-pressed={!fanMode} onClick={() => { setMode("concert"); setErr(""); }}>공연 보러 가세요</button>
            <button type="button" role="tab" className="chip pu" aria-pressed={fanMode} onClick={() => { setMode("fan"); setErr(""); }}>공연 없이 팬덤 스팟 여행</button>
          </div>
        </>
      )}
      {step === 1 && fanMode && (
        <>
          <h1 className="h">어느 가수의 팬덤 스팟으로 보내 드릴까요?</h1>
          <p className="lead">가수가 다녀간 식당·여행지를 하루 코스로 묶어 드려요. 이번 주말 선물로 좋아요.</p>
          <div className="chips">
            {artists.map((a) => (
              <button key={a.name} type="button" className="chip pu" aria-pressed={artist === a.name}
                onClick={() => { setArtist(a.name); setCourseId(courses.find((c) => c.artist === a.name)?.id ?? ""); setErr(""); }}>{a.name}</button>
            ))}
          </div>
          {courses.filter((c) => c.artist === artist).map((c) => (
            <button key={c.id} type="button" className={`card ${c.id === courseId ? "sel" : ""}`} aria-pressed={c.id === courseId} onClick={() => setCourseId(c.id)} style={{ textAlign: "left" }}>
              <div className="show">
                <div className="poster" style={{ background: artists.find((a) => a.name === c.artist)?.color ?? "var(--purple)" }}>{c.artist}</div>
                <div>
                  <b>{c.title}</b>
                  <small>{c.blurb}</small>
                  <small style={{ marginTop: 4 }}>{c.spots.map((s) => s.name.replace(/\s*\(.*\)$/, "")).join(" · ")}</small>
                  <span className="tag pu" style={{ marginTop: 6 }}>콘서트립 팬덤 스팟 {c.spots.length}곳</span>
                </div>
              </div>
            </button>
          ))}
          <div className="card">
            <span className="lab">언제 떠나세요?</span>
            <div className="fld"><span>날짜</span><input className="inp sm" type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} /></div>
            <div className="fld"><span>집에서 출발</span><input className="inp sm" type="time" value={tripStart} onChange={(e) => setTripStart(e.target.value)} /></div>
            <div className="fld"><span>출발지</span><input className="inp sm" value={tr.origin} onChange={(e) => T({ origin: e.target.value })} placeholder="예: 서울 노원구" /></div>
            <p className="fine" style={{ textAlign: "left", margin: "6px 0 0" }}>자가용·택시로 가시면 출발지에서 첫 장소까지 운전 시간을 넣어 드려요.</p>
            <div style={{ paddingTop: 10 }}>
              <span className="lab">동행</span>
              <div className="chips">
                <Chip on={tr.companions === "alone"} onClick={() => T({ companions: "alone" })}>혼자</Chip>
                <Chip on={tr.companions === "friends"} onClick={() => T({ companions: "friends" })}>친구분과</Chip>
                <Chip on={tr.companions === "family"} onClick={() => T({ companions: "family" })}>가족과 함께</Chip>
              </div>
            </div>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="cta" onClick={next1}>다음</button>
        </>
      )}
      {step === 1 && !fanMode && (
        <>
          <h1 className="h">부모님이 어떤 공연에 가시나요?</h1>
          <p className="lead">티켓을 이미 구하셨다면 공연을 골라 주세요.</p>
          {concerts.map((c) => (
            <button key={c.id} type="button" className={`card ${!useCustom && c.id === concertId ? "sel" : ""}`} aria-pressed={!useCustom && c.id === concertId}
              onClick={() => { setConcertId(c.id); setUseCustom(false); setErr(""); }}>
              <div className="show">
                <div className="poster" style={{ background: c.color }}>{c.artist_display || shortTitle(c.title).slice(0, 6)}</div>
                <div>
                  <b>{c.title}</b>
                  <small>{c.city ? `${c.city} ` : ""}{c.venue_name} · {fmtDateKo(c.date)} {fmtTimeKo(c.start_time)}</small>
                  {c.place_count === 0 && <span className="tag in">장소 정보 준비 중</span>}
                  {c.ticket_url && <a href={c.ticket_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="tag ok" style={{ marginLeft: 4, textDecoration: "none" }}>예매처 보기 ↗</a>}
                </div>
              </div>
            </button>
          ))}
          <button type="button" className={`card ${useCustom ? "sel" : ""}`} aria-pressed={useCustom} onClick={() => setUseCustom(true)} style={{ textAlign: "left", fontSize: 15, fontWeight: 700 }}>
            목록에 없어요 · 직접 입력할게요
          </button>
          {useCustom && (
            <div className="card">
              <div className="fld"><span>공연명</span><input className="inp sm" value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} placeholder="예: 영탁 TAK SHOW5" /></div>
              <div className="fld"><span>공연장</span><input className="inp sm" value={custom.venue_name} onChange={(e) => setCustom({ ...custom, venue_name: e.target.value })} placeholder="예: 남동체육관" /></div>
              <div className="fld"><span>날짜</span><input className="inp sm" type="date" value={custom.date} onChange={(e) => setCustom({ ...custom, date: e.target.value })} /></div>
              <div className="fld"><span>시작 시각</span><input className="inp sm" type="time" value={custom.start_time} onChange={(e) => setCustom({ ...custom, start_time: e.target.value })} /></div>
              <p className="fine" style={{ textAlign: "left", margin: "8px 0 0" }}>이 공연은 장소 정보를 준비 중이에요. 식사·이동·귀가 시각만 담은 일반 일정으로 만들어 드려요.</p>
            </div>
          )}
          <div className="card">
            <span className="lab">좌석 · 출발지 · 함께 가시는 분</span>
            <div className="fld"><span>좌석 구역(선택)</span><input className="inp sm" value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="예: B구역 12열" /></div>
            <div className="fld"><span>출발</span><input className="inp sm" value={tr.origin} onChange={(e) => T({ origin: e.target.value })} placeholder="예: 대구 수성구" /></div>
            <div style={{ paddingTop: 10 }}>
              <span className="lab">동행</span>
              <div className="chips">
                <Chip on={tr.companions === "alone"} onClick={() => T({ companions: "alone" })}>혼자</Chip>
                <Chip on={tr.companions === "friends"} onClick={() => T({ companions: "friends" })}>친구분과</Chip>
                <Chip on={tr.companions === "fan_bus"} onClick={() => T({ companions: "fan_bus", mode: "fan_bus" })} tone="pu">지역 팬 모임 버스</Chip>
                <Chip on={tr.companions === "family"} onClick={() => T({ companions: "family" })}>자녀·손주와 함께 (3대)</Chip>
              </div>
              {tr.companions === "friends" && (
                <div className="fld"><span>친구 몇 분?</span>
                  <select className="inp sm" value={tr.friends_count} onChange={(e) => T({ friends_count: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}분</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="cta" onClick={next1}>다음</button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="top"><button className="back" onClick={() => setStep(1)}>← 이전</button><Prog n={2} /></div>
          <h1 className="h">{who}{eunNeun(who)} 어떻게 여행하세요?</h1>
          <p className="lead">{who}께 꼭 맞는 하루를 짜 드릴게요.</p>
          <div className="card"><span className="lab">호칭</span>
            <div className="chips">
              {HONORIFICS.map((h) => <Chip key={h} on={!honorCustom && parent.honorific === h} onClick={() => { setHonorCustom(false); P({ honorific: h }); }}>{h}</Chip>)}
              <Chip on={honorCustom} onClick={() => { setHonorCustom(true); P({ honorific: "" }); }}>직접 입력</Chip>
            </div>
            {honorCustom && <input className="inp" style={{ marginTop: 8 }} value={parent.honorific} onChange={(e) => P({ honorific: e.target.value.slice(0, 10) })} placeholder="예: 엄마, 이모" />}
          </div>
          <div className="card"><span className="lab">연세</span>
            <div className="chips">
              {([["40s", "40대"], ["50s", "50대"], ["60s", "60대"], ["70+", "70대 이상"]] as const).map(([v, l]) => <Chip key={v} on={parent.age_band === v} onClick={() => P({ age_band: v })}>{l}</Chip>)}
            </div></div>
          <div className="card"><span className="lab">걷기 스타일</span>
            <div className="chips">
              {([["30+", "많이 걸어도 좋아요"], ["15-30", "적당히"], ["15-", "여유롭게 (택시·쉬는 시간 넉넉히)"]] as const).map(([v, l]) => <Chip key={v} on={parent.walk === v} onClick={() => P({ walk: v })}>{l}</Chip>)}
            </div></div>
          <div className="card"><span className="lab">평소 하루에 몇 보 정도 걸으세요? (선택)</span>
            <div className="chips">
              {([[5000, "5천 보"], [10000, "1만 보"], [15000, "1만5천 보 이상"], [0, "잘 모르겠어요"]] as const).map(([v, l]) => <Chip key={v} on={parent.steps_usual === v} onClick={() => P({ steps_usual: v })}>{l}</Chip>)}
            </div>
            <p className="fine" style={{ textAlign: "left", margin: "6px 0 0" }}>공연 날 예상 걸음 수를 평소와 비교해 알려 드려요.</p></div>
          <div className="card"><span className="lab">식사 (여러 개 고를 수 있어요)</span>
            <div className="chips">
              {([["korean", "한식"], ["chinese", "중식"], ["japanese", "일식"], ["western", "양식"], ["snack", "분식"], ["mild", "덜 매운 음식"], ["soup", "국물 요리 좋아함"], ["rice", "밥이 좋아요 (면·빵 X)"], ["no_raw", "날것(회·초밥) X"], ["seafood", "해산물 좋아함"], ["quick", "빨리 드시는 편"], ["any", "아무거나 좋아함"]] as const).map(([v, l]) => <Chip key={v} on={parent.food.includes(v)} onClick={() => toggleFood(v)}>{l}</Chip>)}
            </div>
            <input className="inp" style={{ marginTop: 8 }} value={parent.food_other} onChange={(e) => P({ food_other: e.target.value })} placeholder="기타 (예: 밀가루 음식은 안 드세요)" />
          </div>
          {tr.companions !== "alone" && (
            <div className="card"><span className="lab">함께 가시는 분들과 걷는 속도는?</span>
              <div className="chips">
                <Chip on={parent.friends_fitness === "same"} onClick={() => P({ friends_fitness: "same" })}>비슷해요</Chip>
                <Chip on={parent.friends_fitness === "better"} onClick={() => P({ friends_fitness: "better" })}>함께 가는 분들이 더 잘 걸어요</Chip>
              </div></div>
          )}
          <details className="card">
            <summary style={{ fontWeight: 700, fontSize: 15, cursor: "pointer" }}>더 챙겨 드릴 것 (선택)</summary>
            <div className="chips" style={{ marginTop: 10 }}>
              <Chip on={parent.elevator_first} onClick={() => P({ elevator_first: !parent.elevator_first })}>계단보다 엘리베이터가 편하세요</Chip>
              <Chip on={parent.rest_often} onClick={() => P({ rest_often: !parent.rest_often })}>중간중간 앉아서 쉬기</Chip>
              <Chip on={parent.near_toilet} onClick={() => P({ near_toilet: !parent.near_toilet })}>화장실 가까이</Chip>
            </div>
            <span className="lab" style={{ marginTop: 10 }}>약 드시는 시간</span>
            <input className="inp" type="time" value={parent.medicine_time} onChange={(e) => P({ medicine_time: e.target.value })} />
          </details>
          <button className="cta" onClick={() => { if (!parent.honorific.trim()) P({ honorific: "부모님" }); setStep(3); scrollTo(0, 0); }}>다음</button>
        </>
      )}

      {step === 3 && (
        <>
          <div className="top"><button className="back" onClick={() => setStep(2)}>← 이전</button><Prog n={3} /></div>
          <h1 className="h">{fanMode ? "어떻게 가실까요?" : "어떤 여행을 좋아하세요?"}</h1>
          {!fanMode && <div className="card"><span className="lab">덕질 취향</span>
            <div className="chips">
              <Chip tone="pk" on={prefs.goods} onClick={() => setPrefs({ ...prefs, goods: !prefs.goods })}>공식 굿즈 꼭 사기</Chip>
              <Chip tone="pk" on={prefs.photo} onClick={() => setPrefs({ ...prefs, photo: !prefs.photo })}>공연장 포토존</Chip>
              <Chip tone="pu" on={prefs.artist_places} onClick={() => setPrefs({ ...prefs, artist_places: !prefs.artist_places, fan_first: prefs.artist_places ? false : prefs.fan_first })}>가수가 다녀간 곳</Chip>
              <Chip on={prefs.sightseeing} onClick={() => setPrefs({ ...prefs, sightseeing: !prefs.sightseeing })}>지역 관광</Chip>
            </div>
            {prefs.artist_places && (
              <div style={{ marginTop: 10 }}>
                <span className="lab">가수가 다녀간 곳은 얼마나 가고 싶으세요?</span>
                <div className="chips">
                  <Chip tone="pu" on={!prefs.fan_first} onClick={() => setPrefs({ ...prefs, fan_first: false })}>시간 나면 들르기</Chip>
                  <Chip tone="pu" on={prefs.fan_first} onClick={() => setPrefs({ ...prefs, fan_first: true })}>꼭 가고 싶어요 (1순위)</Chip>
                </div>
                {prefs.fan_first && <p className="fine" style={{ textAlign: "left", margin: "6px 0 0" }}>굿즈·포토존보다 먼저 넣고, 걸어가기 멀면 택시를 안내해요.</p>}
              </div>
            )}
          </div>}
          <span className="lab" style={{ margin: "2px 0 -6px" }}>{fanMode ? `${course?.start ?? city}까지` : `${city || "공연장"}까지`} 어떻게 가실까요?</span>
          <div className="row2">
            {(fanMode ? [["train", "열차·고속버스", "도착·돌아오는 시각을 넣어 주세요"], ["car", "자가용·택시", "스팟 사이가 멀면 택시를 안내해요"]] as const : [["fan_bus", "팬 모임 버스", "집결 장소·시간을 입력해 주세요"], ["train", "열차", "출발·도착 시각을 입력해 주세요"], ["shuttle", "공연 셔틀", "공지 링크나 시각을 넣어 주세요"], ["car", "자가용·택시", "공연장 주차 혼잡 주의"]] as const).map(([v, l, d]) => (
              <button key={v} type="button" className="opt" aria-pressed={tr.mode === v} onClick={() => T({ mode: v })}><b>{l}</b><small>{d}</small></button>
            ))}
          </div>
          {tr.mode === "fan_bus" && (
            <div className="card">
              <div className="fld"><span>집결 장소</span><input className="inp sm" value={tr.meet_place} onChange={(e) => T({ meet_place: e.target.value })} placeholder="예: 수성못 공영주차장" /></div>
              <div className="fld"><span>집결 시각</span><input className="inp sm" type="time" value={tr.meet_time} onChange={(e) => T({ meet_time: e.target.value })} /></div>
              <div className="fld"><span>하차 지점</span><input className="inp sm" value={tr.drop_point} onChange={(e) => T({ drop_point: e.target.value })} placeholder="모르면 비워 두세요" /></div>
              <div className="fld"><span>귀가 출발 시각</span><input className="inp sm" type="time" value={tr.return_time} onChange={(e) => T({ return_time: e.target.value })} /></div>
              <div className="fld"><span>귀가 출발 장소</span><input className="inp sm" value={tr.return_place} onChange={(e) => T({ return_place: e.target.value })} placeholder="예: 동쪽 주차장" /></div>
            </div>
          )}
          {tr.mode === "train" && (
            <div className="card">
              <div className="fld"><span>출발역</span><input className="inp sm" value={tr.train_from} onChange={(e) => T({ train_from: e.target.value })} placeholder="예: 동대구" /></div>
              <div className="fld"><span>도착역</span><input className="inp sm" value={tr.train_to} onChange={(e) => T({ train_to: e.target.value })} placeholder="예: 수서" /></div>
              <div className="fld"><span>출발 시각</span><input className="inp sm" type="time" value={tr.train_depart} onChange={(e) => T({ train_depart: e.target.value })} /></div>
              <div className="fld"><span>도착 시각</span><input className="inp sm" type="time" value={tr.train_arrive} onChange={(e) => T({ train_arrive: e.target.value })} /></div>
              <div className="fld"><span>돌아오는 열차</span><input className="inp sm" type="time" value={tr.train_return_depart} onChange={(e) => T({ train_return_depart: e.target.value })} /></div>
              <p className="fine" style={{ textAlign: "left", margin: "8px 0 6px" }}>아직 표가 없으면 먼저 예매하고 시각을 넣어 주세요. 코레일·SRT는 외부 앱에서 바로 예매하는 기능을 열어 두지 않아 예매처로 이동해요.</p>
              <div className="linkrow">
                <a href="https://www.letskorail.com/" target="_blank" rel="noopener noreferrer">🚄 코레일 ↗</a>
                <a href="https://etk.srail.kr/" target="_blank" rel="noopener noreferrer">🚅 SRT ↗</a>
                <a href="https://www.kobus.co.kr/" target="_blank" rel="noopener noreferrer">🚌 고속버스 ↗</a>
              </div>
            </div>
          )}
          {tr.mode === "shuttle" && (
            <div className="card"><span className="lab">셔틀 공지 링크 또는 시각</span>
              {concert?.shuttle_url && <a className="actbtn" style={{ marginBottom: 8 }} href={concert.shuttle_url} target="_blank" rel="noopener noreferrer">🚌 이 공연 셔틀 예약하러 가기 ↗</a>}
              <p className="fine" style={{ textAlign: "left", margin: "0 0 6px" }}>아직 예약 전이면 공연명으로 찾아 예약하세요.</p>
              <div className="linkrow" style={{ marginBottom: 8 }}>
                <a href="https://www.kakaomobility.com/service-kakaot/shuttle" target="_blank" rel="noopener noreferrer">카카오 T 셔틀 ↗</a>
                <a href="https://queenssmile.co.kr" target="_blank" rel="noopener noreferrer">퀸즈스마일 ↗</a>
                <a href="https://www.bustada.com" target="_blank" rel="noopener noreferrer">버스타다 ↗</a>
              </div>
              <textarea className="inp" rows={2} value={tr.shuttle_info} onChange={(e) => T({ shuttle_info: e.target.value })} placeholder="공지가 아직 없으면 비워 두세요" /></div>
          )}
          <div className="card"><span className="lab">숙박</span>
            <div className="chips">
              <Chip on={tr.stay === "day"} onClick={() => T({ stay: "day" })}>당일 귀가</Chip>
              <Chip on={tr.stay === "overnight"} onClick={() => T({ stay: "overnight" })}>1박</Chip>
            </div>
            {tr.stay === "overnight" && (
              <>
                <div className="fld"><span>숙소 이름</span><input className="inp sm" value={tr.stay_name ?? ""} onChange={(e) => T({ stay_name: e.target.value })} placeholder="예: 신라스테이 삼성" /></div>
                <div className="fld"><span>카카오맵 링크(선택)</span><input className="inp sm" value={tr.stay_link ?? ""} onChange={(e) => T({ stay_link: e.target.value })} placeholder="링크나 주소" /></div>
                <p className="fine" style={{ textAlign: "left", margin: "6px 0 0" }}>{fanMode ? "하루 일정 끝에" : "공연이 끝나면"} 숙소 체크인 안내와 길찾기 버튼을 넣어 드려요.</p>
              </>
            )}</div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="cta" onClick={submit}>AI로 효도여행 만들기</button>
        </>
      )}
    </main>
  );
}
