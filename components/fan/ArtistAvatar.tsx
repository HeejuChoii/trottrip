"use client";
import { useEffect, useRef, useState } from "react";
import { inkOn, type FanArtist } from "@/lib/community";

/** 가수 사진(public/artists/{slug}.jpg). 없으면 가수 색 동그라미에 이름 */
export default function ArtistAvatar({ a, size = 72 }: { a: FanArtist; size?: number }) {
  const [ok, setOk] = useState(true);
  const img = useRef<HTMLImageElement>(null);
  // 화면이 붙기 전에 이미 실패한 이미지는 onError가 안 불려서, 붙은 뒤 한 번 더 확인한다
  useEffect(() => { const el = img.current; if (el && el.complete && el.naturalWidth === 0) setOk(false); }, []);
  if (ok) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img ref={img} src={`/artists/${a.slug}.jpg`} alt={a.name} width={size} height={size} onError={() => setOk(false)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", background: a.color, flex: "none", color: "transparent" }} />;
  }
  return <span style={{ width: size, height: size, borderRadius: "50%", background: a.color, color: inkOn(a.color), fontWeight: 800, fontSize: size / 4.2, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{a.name}</span>;
}
