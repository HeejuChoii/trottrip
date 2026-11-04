"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { clientNow } from "@/lib/client";
import { absMin, toMin } from "@/lib/time";
import { kidHonorific } from "@/lib/text";
import { CATEGORY_LABEL } from "@/lib/concertrip";
import { BottomBar } from "./ParentHome";
import type { Place, PlanItem } from "@/lib/types";
import { PIN_LABEL, pinElement } from "./mapPin";


/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { kakao?: any } }

interface Props {
  token: string; items: PlanItem[]; done: string[]; concertDate: string; pins: Place[]; focus: string | null;
  venue: { name: string; lat: number | null; lng: number | null }; kakaoKey: string; kidLabel: string; pilgrim?: boolean;
  /** 출발역·도착역·숙소 같은 추가 핀 */
  extraPins?: { label: string; name: string; lat: number; lng: number }[];
}

export default function ParentMap(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const meMarker = useRef<any>(null);
  const [mapOk, setMapOk] = useState<boolean | null>(p.kakaoKey ? null : false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState("");
  // 우리 지도 안 길찾기: 내 위치 → 다음 장소 (도보·택시 예상, 카카오내비가 켜져 있으면 실제 차 길)
  const [route, setRoute] = useState<{ walk: number; taxi: number; km: number; road: boolean } | null>(null);
  const lines = useRef<any[]>([]);

  const target = useMemo(() => {
    if (p.focus) {
      const f = p.pins.find((x) => x.id === p.focus);
      if (f) return { place: f, label: CATEGORY_LABEL[f.category] };
    }
    const { date, min } = clientNow();
    const done = new Set(p.done);
    const upcoming = [...p.items].sort((a, b) => absMin(a) - absMin(b))
      .filter((i) => !done.has(i.id) && i.place_id && (date < p.concertDate || toMin(i.end) > min || i.type === "return"));
    for (const i of upcoming) {
      const pl = p.pins.find((x) => x.id === i.place_id);
      if (pl) return { place: pl, label: i.title.split(" · ")[0] };
    }
    return null;
  }, [p.focus, p.pins, p.items, p.done, p.concertDate]);

  useEffect(() => {
    if (!p.kakaoKey) return;
    const init = () => window.kakao.maps.load(() => {
      if (!box.current) return;
      const k = window.kakao.maps;
      const center = target?.place.lat != null ? new k.LatLng(target.place.lat, target.place.lng)
        : p.venue.lat != null ? new k.LatLng(p.venue.lat, p.venue.lng) : p.pins[0] ? new k.LatLng(p.pins[0].lat, p.pins[0].lng) : new k.LatLng(37.5665, 126.978);
      map.current = new k.Map(box.current, { center, level: 3 });
      for (const pin of p.pins) {
        const isT = target?.place.id === pin.id;
        // 일정에 들어간 곳은 일정 이름(점심·굿즈…), 나머지는 시설 이름(화장실·입구…)
        const it = p.items.find((i) => i.place_id === pin.id);
        const label = it ? (/ 스팟 · /.test(it.title) ? pin.name.replace(/\s*\(.*\)$/, "") : it.title.split(" · ")[0]) : PIN_LABEL[pin.category] ?? pin.name;
        const el = pinElement(label, { focus: isT });
        el.title = pin.name;
        new k.CustomOverlay({ map: map.current, position: new k.LatLng(pin.lat, pin.lng), content: el, yAnchor: 1, zIndex: isT ? 3 : 1 });
      }
      // 출발역·도착역·숙소 (같은 곳은 한 번만)
      const seen = new Set<string>();
      for (const x of p.extraPins ?? []) {
        const key = `${x.lat.toFixed(4)},${x.lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const el = pinElement(`${x.label} · ${x.name}`);
        new k.CustomOverlay({ map: map.current, position: new k.LatLng(x.lat, x.lng), content: el, yAnchor: 1, zIndex: 2 });
      }
      setMapOk(true);
    });
    if (window.kakao?.maps) return init();
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(p.kakaoKey)}&autoload=false`;
    s.async = true;
    s.onload = init;
    s.onerror = () => setMapOk(false);
    document.head.appendChild(s);
  }, [p.kakaoKey, p.pins, p.venue, target]);

  // 내 위치: 이 기기 화면에만 표시. 서버로 보내지 않는다.
  function locate() {
    if (!navigator.geolocation) return setLocErr("이 휴대폰에서는 위치를 볼 수 없어요.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(loc); setLocErr("");
        if (map.current && window.kakao?.maps) {
          const k = window.kakao.maps;
          const el = document.createElement("div");
          el.style.cssText = "width:18px;height:18px;border-radius:50%;background:#14C1AD;border:3px solid #fff;box-shadow:0 0 0 2px #0B8F80, 0 2px 6px rgba(0,0,0,.3)";
          el.title = "내 위치";
          meMarker.current?.setMap(null);
          meMarker.current = new k.CustomOverlay({ map: map.current, position: new k.LatLng(loc.lat, loc.lng), content: el, zIndex: 4 });
          map.current.setCenter(new k.LatLng(loc.lat, loc.lng));
        }
      },
      () => setLocErr("위치 권한이 꺼져 있어요. 지도만 보여 드릴게요."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // 물어보기에서 "지도에서 길찾기"로 왔으면 바로 내 위치를 찾는다(권한은 휴대폰이 묻는다)
  useEffect(() => {
    if (new URLSearchParams(location.search).get("route") === "1") locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 내 위치를 찾으면 다음 장소까지 선을 긋고 시간을 계산한다
  useEffect(() => {
    const dest = target?.place;
    if (!me || !dest || dest.lat == null || dest.lng == null || !map.current || !window.kakao?.maps) return;
    const k = window.kakao.maps;
    for (const l of lines.current) l.setMap(null);
    lines.current = [];
    const R = 6371, r = Math.PI / 180;
    const h = Math.sin(((dest.lat - me.lat) * r) / 2) ** 2 + Math.cos(me.lat * r) * Math.cos(dest.lat * r) * Math.sin(((dest.lng - me.lng) * r) / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
    const walk = Math.max(1, Math.round((km / 3.5) * 60)); // 어르신 걸음 시속 3.5km
    const taxi = Math.max(5, Math.round(5 + (km / 22) * 60));
    setRoute({ walk, taxi, km, road: false });
    lines.current.push(new k.Polyline({ map: map.current, path: [new k.LatLng(me.lat, me.lng), new k.LatLng(dest.lat, dest.lng)], strokeWeight: 4, strokeColor: "#FA2D48", strokeOpacity: 0.8, strokeStyle: "shortdash" }));
    const b = new k.LatLngBounds(); b.extend(new k.LatLng(me.lat, me.lng)); b.extend(new k.LatLng(dest.lat, dest.lng));
    map.current.setBounds(b, 60, 40, 60, 40);
    // 걸어가기 멀면 실제 차 길(카카오내비)을 받아 그린다. 안 켜져 있으면 직선만
    if (walk > 15) {
      fetch(`/api/p/${p.token}/route?from=${me.lat},${me.lng}&to=${dest.lat},${dest.lng}`).then((x) => x.json()).then((j: { ok: boolean; km?: number; min?: number; path?: [number, number][] }) => {
        if (!j.ok || !j.path?.length || !map.current) return;
        lines.current.push(new k.Polyline({ map: map.current, path: j.path.map(([a, c]) => new k.LatLng(a, c)), strokeWeight: 6, strokeColor: "#14C1AD", strokeOpacity: 0.9 }));
        setRoute({ walk, taxi: Math.max(5, (j.min ?? taxi) + 3), km: j.km ?? km, road: true });
      }).catch(() => undefined);
    }
  }, [me, target, p.token]);

  const t = target?.place;
  const nav = t && t.lat != null
    ? me
      ? `https://map.kakao.com/link/by/walk/${encodeURIComponent("내 위치")},${me.lat},${me.lng}/${encodeURIComponent(t.name)},${t.lat},${t.lng}`
      : `https://map.kakao.com/link/to/${encodeURIComponent(t.name)},${t.lat},${t.lng}`
    : null;

  return (
    <main className="shell pv">
      <div className="top"><Link className="back" href={`/p/${p.token}`} style={{ fontSize: 18 }}>← 일정으로</Link></div>
      {t ? (
        <div className="next" style={{ padding: "14px 16px" }}>
          <div className="k">{p.focus ? "찾는 곳" : "다음 장소"}</div>
          <div className="w" style={{ fontSize: 26 }}>{target!.label === CATEGORY_LABEL[t.category] ? t.name : `${target!.label}`}</div>
          <div className="d" style={{ fontSize: 18 }}>{[t.walk_min_from_venue != null ? `공연장에서 걸어서 ${t.walk_min_from_venue}분` : null, t.description_ko || t.name].filter(Boolean).join(" · ")}</div>
        </div>
      ) : (
        <div className="next" style={{ padding: "14px 16px" }}><div className="w" style={{ fontSize: 24 }}>{p.venue.name}</div><div className="d">다음 장소 정보가 없어요.</div></div>
      )}
      {p.kakaoKey && mapOk !== false && <div ref={box} className="mapbox" role="application" aria-label="오늘 쓰는 장소 지도" />}
      {mapOk === false && (
        <div className="mini" aria-label="오늘 쓰는 장소">
          {p.pins.map((x) => (
            <a key={x.id} className="mi" href={`https://map.kakao.com/link/to/${encodeURIComponent(x.name)},${x.lat},${x.lng}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
              <span>{CATEGORY_LABEL[x.category]} · {x.name}</span><b>{x.walk_min_from_venue != null ? `${x.walk_min_from_venue}분` : ""}</b>
            </a>
          ))}
          {!p.pins.length && <p className="note">지도에 표시할 장소를 준비 중이에요.</p>}
        </div>
      )}
      {route && t ? (
        <div className="card" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <b>{t.name.replace(/\s*\(.*\)$/, "")}까지</b><br />
          🚶 걸어서 약 {route.walk}분 · 🚕 택시 약 {route.taxi}분 <small style={{ color: "var(--sub)" }}>({route.km.toFixed(1)}km{route.road ? " · 실제 도로" : ""})</small>
          {route.walk > 15 && <><br /><small style={{ color: "var(--sub)" }}>걸어가기 멀어요. 택시를 타시는 게 편해요.</small></>}
        </div>
      ) : t ? <p className="note" style={{ margin: 0 }}>‘내 위치 보기’를 누르면 여기서 {t.name.replace(/\s*\(.*\)$/, "")}까지 길과 시간을 보여 드려요.</p> : null}
      <button className="bigbtn line" onClick={locate} style={{ fontSize: 19 }}>{route ? "내 위치 다시 찾기" : "내 위치 보기"}</button>
      {locErr && <p className="note">{locErr}</p>}
      {nav && <a className="ghost" style={{ textAlign: "center", textDecoration: "none", display: "block" }} href={nav} target="_blank" rel="noopener noreferrer">카카오맵에서 자세한 길 안내 ↗</a>}
      <p className="note">내 위치는 이 휴대폰에서만 보여요. {kidHonorific(p.kidLabel)}께 보내지 않아요.</p>
      <BottomBar token={p.token} pilgrim={p.pilgrim} current="map" />
    </main>
  );
}
