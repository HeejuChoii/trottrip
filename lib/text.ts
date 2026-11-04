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

const SOURCE_NAMES: [RegExp, string][] = [
  [/youtube\.com|youtu\.be/, "유튜브"], [/blog\.naver|m\.blog\.naver/, "네이버 블로그"], [/cafe\.naver/, "네이버 카페"],
  [/x\.com|twitter\.com/, "X(트위터)"], [/instagram\.com/, "인스타그램"], [/weverse\.io/, "위버스"], [/fanmaum/, "팬마음"],
  [/tistory\.com/, "티스토리"], [/brunch\.co\.kr/, "브런치"], [/namu\.wiki/, "나무위키"],
  [/starnewskorea/, "스타뉴스"], [/topstarnews/, "톱스타뉴스"], [/xportsnews/, "엑스포츠뉴스"], [/esquirekorea/, "에스콰이어"],
  [/allurekorea/, "얼루어"], [/hotplacehunter/, "핫플헌터"], [/diningcode/, "다이닝코드"], [/siksinhot/, "식신"], [/tabling/, "테이블링"],
  [/polle\.com/, "폴레"], [/triple\.guide/, "트리플"], [/visitkorea/, "대한민국 구석구석"], [/v\.daum\.net|news\.daum/, "다음 뉴스"],
  [/news\.nate|m\.news\.nate/, "네이트 뉴스"], [/imbc\.com/, "MBC"], [/kbs\.co\.kr/, "KBS"], [/sbs\.co\.kr/, "SBS"], [/ytn\.co\.kr/, "YTN"],
  [/khan\.co\.kr/, "경향신문"], [/imaeil\.com/, "매일신문"], [/yeongnam\.com/, "영남일보"], [/isplus\.com/, "일간스포츠"],
  [/etoday/, "이투데이"], [/asiae/, "아시아경제"], [/seoul\.co\.kr/, "서울신문"], [/wikitree/, "위키트리"], [/kukinews/, "쿠키뉴스"],
  [/metroseoul/, "메트로신문"], [/tvreport/, "TV리포트"], [/nocutnews/, "노컷뉴스"], [/newsis/, "뉴시스"], [/kbmaeil/, "경북매일"],
];

/** 근거 링크 이름: 유튜브·네이버 블로그·스타뉴스… (모르는 곳은 도메인) */
export function sourceName(url: string): string {
  for (const [re, n] of SOURCE_NAMES) if (re.test(url)) return n;
  try { return new URL(url).hostname.replace(/^www\.|^m\./, ""); } catch { return "근거"; }
}
