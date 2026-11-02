"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import { captureSrc, clientId, ls, postJSON, ss, track } from "@/lib/client";
import { fmtDateKo, fmtTimeKo, toMin, toHHMM } from "@/lib/time";
import type { Concert, ParentProfile, Prefs, Transport } from "@/lib/types";
import { shortTitle } from "@/lib/planner";

type C = Concert & { place_count: number };

function Chip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "pk" | "pu" }) {
  return <button type="button" className={`chip ${tone ?? ""}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}

function Prog({ n }: { n: number }) {
  return <div className="prog" aria-label={`${n}/3 단계`}>{[1, 2, 3].map((i) => <span key={i} className={i <= n ? "on" : ""} />)}</div>;
}

const HONORIFICS = ["어머니", "아버지", "두 분"];

export default function Wizard({ concerts }: { concerts: C[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [concertId, setConcertId] = useState<string | null>(concerts[0]?.id ?? null);
  const [custom, setCustom] = useState({ title: "", venue_name: "", date: "", start_time: "" });
  const [useCustom, setUseCustom] = useState(concerts.length === 0);
  const [seat, setSeat] = useState("");
  const [honorCustom, setHonorCustom] = useState(false);
  const [parent, setParent] = useState<ParentProfile>({
    honorific: "어머니", age_band: "60s", walk: "15-30", rest_often: true, elevator_first: true,
    food: ["korean", "mild"], food_other: "", medicine_time: "", friends_fitness: "same",
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
  const startTime = useCustom ? custom.start_time : concert?.start_time ?? "";
  const city = useCustom ? "" : concert?.city ?? "";

  function next1() {
    if (useCustom) {
      if (!custom.title || !custom.venue_name || !custom.date || !custom.start_time) return setErr("공연명·공연장·날짜·시작 시각을 모두 넣어 주세요.");
    } else if (!concert) return setErr("공연을 골라 주세요.");
    setErr(""); setStep(2); scrollTo(0, 0);
  }

  async function submit() {
    setErr(""); setStep(4); scrollTo(0, 0);
    const consent = JSON.parse(ss.get("tt_consent") || "{}");
    try {
      const r = await postJSON<{ kid_token: string }>("/api/trips", {
        concert_id: useCustom ? null : concertId,
        custom_concert: useCustom ? custom : null,
        parent_profile: parent, prefs,
        transport: { ...tr, companions: tr.mode === "fan_bus" ? "fan_bus" : tr.companions },
        seat, src: ls.get("tt_src") ?? "", privacy_ok: !!consent.privacy, marketing_opt_in: !!consent.marketing,
      });
      router.push(`/k/${r.kid_token}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "일정을 만들지 못했어요. 입력을 확인하고 다시 눌러 주세요.");
      setStep(3);
    }
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
            <div className="ok">공연 시작 {fmtTimeKo(startTime)} 기준으로 역산</div>
            <div className="ok">{parent.walk === "15-" ? "걸어서 5분" : parent.walk === "15-30" ? "걸어서 10분" : "걸어서 15분"} 이내 장소만</div>
            {prefs.goods && <div className="ok">굿즈 줄 대기 시간 넉넉히 확보</div>}
            <div>{isNaN(S) ? "입장 전" : `${toHHMM(S - 40)} 입장 전`} 앉아서 쉴 곳 찾는 중</div>
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
                <Chip on={tr.companions === "fan_bus"} onClick={() => T({ companions: "fan_bus", mode: "fan_bus" })} tone="pu">팬 모임 버스</Chip>
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
          <h1 className="h">{who}에 대해 알려 주세요</h1>
          <div className="card"><span className="lab">호칭</span>
            <div className="chips">
              {HONORIFICS.map((h) => <Chip key={h} on={!honorCustom && parent.honorific === h} onClick={() => { setHonorCustom(false); P({ honorific: h }); }}>{h}</Chip>)}
              <Chip on={honorCustom} onClick={() => { setHonorCustom(true); P({ honorific: "" }); }}>직접 입력</Chip>
            </div>
            {honorCustom && <input className="inp" style={{ marginTop: 8 }} value={parent.honorific} onChange={(e) => P({ honorific: e.target.value.slice(0, 10) })} placeholder="예: 엄마, 이모" />}
          </div>
          <div className="card"><span className="lab">연세</span>
            <div className="chips">
              {([["50s", "50대"], ["60s", "60대"], ["70+", "70대 이상"]] as const).map(([v, l]) => <Chip key={v} on={parent.age_band === v} onClick={() => P({ age_band: v })}>{l}</Chip>)}
            </div></div>
          <div className="card"><span className="lab">한 번에 걸으실 수 있는 시간</span>
            <div className="chips">
              {([["30+", "30분 이상"], ["15-30", "15~30분"], ["15-", "15분 이하"]] as const).map(([v, l]) => <Chip key={v} on={parent.walk === v} onClick={() => P({ walk: v })}>{l}</Chip>)}
            </div></div>
          <div className="card"><span className="lab">쉬는 시간</span>
            <div className="chips">
              <Chip on={parent.rest_often} onClick={() => P({ rest_often: true })}>자주 앉아 쉬셔야 해요</Chip>
              <Chip on={!parent.rest_often} onClick={() => P({ rest_often: false })}>괜찮으세요</Chip>
            </div></div>
          <div className="card"><span className="lab">계단</span>
            <div className="chips">
              <Chip on={parent.elevator_first} onClick={() => P({ elevator_first: true })}>엘리베이터 우선</Chip>
              <Chip on={!parent.elevator_first} onClick={() => P({ elevator_first: false })}>계단도 괜찮아요</Chip>
            </div></div>
          <div className="card"><span className="lab">식사 (여러 개 고를 수 있어요)</span>
            <div className="chips">
              {([["korean", "한식"], ["mild", "안 매운 음식"], ["seafood", "해산물 OK"], ["quick", "빨리 드시는 편"]] as const).map(([v, l]) => <Chip key={v} on={parent.food.includes(v)} onClick={() => toggleFood(v)}>{l}</Chip>)}
            </div>
            <input className="inp" style={{ marginTop: 8 }} value={parent.food_other} onChange={(e) => P({ food_other: e.target.value })} placeholder="기타 (예: 밀가루 못 드세요)" />
          </div>
          <div className="card"><span className="lab">약 드시는 시간 (선택)</span>
            <input className="inp" type="time" value={parent.medicine_time} onChange={(e) => P({ medicine_time: e.target.value })} />
          </div>
          {tr.companions !== "alone" && (
            <div className="card"><span className="lab">함께 가시는 분들도 비슷하세요?</span>
              <div className="chips">
                <Chip on={parent.friends_fitness === "same"} onClick={() => P({ friends_fitness: "same" })}>네, 비슷해요</Chip>
                <Chip on={parent.friends_fitness === "better"} onClick={() => P({ friends_fitness: "better" })}>더 잘 걸으세요</Chip>
              </div></div>
          )}
          <button className="cta" onClick={() => { if (!parent.honorific.trim()) P({ honorific: "부모님" }); setStep(3); scrollTo(0, 0); }}>다음</button>
        </>
      )}

      {step === 3 && (
        <>
          <div className="top"><button className="back" onClick={() => setStep(2)}>← 이전</button><Prog n={3} /></div>
          <h1 className="h">어떤 여행을 좋아하세요?</h1>
          <div className="card"><span className="lab">덕질 취향</span>
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
          </div>
          <span className="lab" style={{ margin: "2px 0 -6px" }}>{city || "공연장"}까지 어떻게 가실까요?</span>
          <div className="row2">
            {([["fan_bus", "팬 모임 버스", "집결 장소·시간을 입력해 주세요"], ["train", "열차", "출발·도착 시각을 입력해 주세요"], ["shuttle", "공연 셔틀", "공지 링크나 시각을 넣어 주세요"], ["car", "자가용·택시", "공연장 주차 혼잡 주의"]] as const).map(([v, l, d]) => (
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
              <p className="fine" style={{ textAlign: "left", margin: "8px 0 0" }}>시간표는 연동되지 않아요. 예매한 열차 시각을 넣어 주세요.</p>
            </div>
          )}
          {tr.mode === "shuttle" && (
            <div className="card"><span className="lab">셔틀 공지 링크 또는 시각</span>
              <textarea className="inp" rows={2} value={tr.shuttle_info} onChange={(e) => T({ shuttle_info: e.target.value })} placeholder="공지가 아직 없으면 비워 두세요" /></div>
          )}
          <div className="card"><span className="lab">숙박</span>
            <div className="chips">
              <Chip on={tr.stay === "day"} onClick={() => T({ stay: "day" })}>당일 귀가</Chip>
              <Chip on={tr.stay === "overnight"} onClick={() => T({ stay: "overnight" })}>1박</Chip>
            </div></div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="cta" onClick={submit}>AI로 효도여행 만들기</button>
        </>
      )}
    </main>
  );
}
