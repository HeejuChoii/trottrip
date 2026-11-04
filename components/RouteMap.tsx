"use client";
// 자녀용 동선 지도: 지도만 크게, 일정 순서대로 번호 핀을 잇는다(부모님 안내장 화면과 별개)
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { pinElement } from "./mapPin";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Stop { n: number; time: string; label: string; name: string; lat: number; lng: number }

export default function RouteMap({ kidToken, title, stops, kakaoKey }: { kidToken: string; title: string; stops: Stop[]; kakaoKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState<boolean | null>(kakaoKey ? null : false);

  useEffect(() => {
    if (!kakaoKey || !stops.length) { if (!stops.length) setOk(false); return; }
    const init = () => (window as any).kakao.maps.load(() => {
      if (!box.current) return;
      const k = (window as any).kakao.maps;
      const map = new k.Map(box.current, { center: new k.LatLng(stops[0].lat, stops[0].lng), level: 5 });
      const bounds = new k.LatLngBounds();
      const path = stops.map((s) => new k.LatLng(s.lat, s.lng));
      new k.Polyline({ map, path, strokeWeight: 5, strokeColor: "#FF5C93", strokeOpacity: 0.85, strokeStyle: "solid" });
      for (const s of stops) {
        const pos = new k.LatLng(s.lat, s.lng);
        bounds.extend(pos);
        const el = pinElement(s.label, { num: s.n });
        el.title = s.name;
        new k.CustomOverlay({ map, position: pos, content: el, yAnchor: 1, zIndex: 2 });
      }
      if (stops.length > 1) map.setBounds(bounds, 60, 40, 60, 40);
      setOk(true);
    });
    if ((window as any).kakao?.maps) return init();
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoKey)}&autoload=false`;
    s.async = true; s.onload = init; s.onerror = () => setOk(false);
    document.head.appendChild(s);
  }, [kakaoKey, stops]);

  return (
    <main className="shell">
      <div className="top"><Link className="back" href={`/k/${kidToken}`}>← 일정으로</Link></div>
      <h1 className="h" style={{ fontSize: 20 }}>{title} 동선</h1>
      {ok !== false && <div ref={box} className="mapbox" style={{ height: "62vh" }} role="application" aria-label="일정 순서 지도" />}
      <div className="mini">
        {stops.map((s) => (
          <a key={s.n} className="mi" style={{ fontSize: 15, textDecoration: "none", color: "inherit" }} href={`https://map.kakao.com/link/to/${encodeURIComponent(s.name)},${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer">
            <span><b style={{ color: "var(--pinkD)", marginRight: 8 }}>{s.n}</b>{s.label} · {s.name}</span><b>{s.time}</b>
          </a>
        ))}
        {!stops.length && <p className="note">아직 좌표가 있는 장소가 없어요.</p>}
      </div>
    </main>
  );
}
