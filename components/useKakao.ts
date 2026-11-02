"use client";
import { useEffect, useState } from "react";

// 카카오 JS SDK (공유). 키가 없거나 로드 실패 시 null → 링크 복사/Web Share로 대신
declare global {
  interface Window { Kakao?: { init: (k: string) => void; isInitialized: () => boolean; Share: { sendDefault: (o: unknown) => void } } }
}

const SDK = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";

export function useKakao(key: string) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!key) return;
    const done = () => {
      try {
        if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(key);
        setReady(!!window.Kakao?.isInitialized());
      } catch { setReady(false); }
    };
    if (window.Kakao) return done();
    const s = document.createElement("script");
    s.src = SDK; s.async = true; s.crossOrigin = "anonymous";
    s.onload = done;
    document.head.appendChild(s);
  }, [key]);
  return ready;
}
