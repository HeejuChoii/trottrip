"use client";
import { useEffect, useRef, useState } from "react";

// Web Speech API (한국어). 지원하지 않으면 supported=false → 키보드 입력
type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function useSpeech(onText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) return;
    const r = new C();
    r.lang = "ko-KR"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) cb.current(t); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setSupported(true);
  }, []);

  function start() {
    if (!rec.current) return;
    try { rec.current.start(); setListening(true); } catch { setListening(false); }
  }
  function stop() { rec.current?.stop(); }
  return { supported, listening, start, stop };
}
