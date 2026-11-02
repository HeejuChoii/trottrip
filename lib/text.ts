// 문구 헬퍼 (클라이언트·서버 공용)

function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return /[0-9LMNRlmnr]$/.test(ch) ? true : false;
  return (code - 0xac00) % 28 !== 0;
}

/** 이/가 */
export function iGa(word: string): string {
  return hasBatchim(word) ? "이" : "가";
}

/** 딸 → 따님, 아들 → 아드님 */
export function kidHonorific(label: string): string {
  const l = (label || "").trim();
  if (!l) return "자녀분";
  if (l === "딸") return "따님";
  if (l === "아들") return "아드님";
  if (l === "며느리") return "며느님";
  if (l.endsWith("님")) return l;
  return `${l}님`;
}

/** "희주(딸)이 보낸 공연 날 안내장" / "딸이 보낸 공연 날 안내장" */
export function shareTitle(kidLabel: string, kidName: string): string {
  const label = (kidLabel || "자녀").trim();
  const who = kidName?.trim() ? `${kidName.trim()}(${label})` : label;
  return `${who}${iGa(label)} 보낸 공연 날 안내장`;
}

/** 부모님 호칭 → 자녀 진행 화면 "엄마는 지금" */
export function parentShort(honorific: string): string {
  if (honorific === "어머니") return "엄마";
  if (honorific === "아버지") return "아빠";
  if (honorific === "두 분") return "부모님";
  return honorific || "부모님";
}

/** 호칭 + 은/는 */
export function eunNeun(word: string): string {
  return hasBatchim(word) ? "은" : "는";
}
