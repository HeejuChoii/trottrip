// 공지 자동 확인: 공연 2주 전부터 하루 한 번, Claude가 웹을 검색해 입장 시간·게이트·MD 부스·셔틀 공지를 찾는다.
// 찾은 결과는 바로 부모님 화면에 반영하지 않고 /admin에 "제안"으로 쌓는다(운영자가 적용 버튼으로 반영).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, aiEnabled } from "./ai.ts";
import { budgetLeft, recordUsage } from "./usage.ts";
import { extractNotice, type NoticeExtract } from "./notice-extract.ts";
import type { Concert } from "./types.ts";

export interface NoticeFinding {
  text: string; // 검색으로 모은 요약(근거 문장)
  sources: { title: string; url: string }[];
  extract: NoticeExtract;
}

export async function findNoticeOnWeb(c: Concert): Promise<NoticeFinding> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY가 없어요");
  if (!(await budgetLeft()).ok) throw new Error("AI 사용량 한도라 자동 확인을 건너뛰었어요");
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const q = `${c.title} ${c.date.slice(0, 4)} ${c.venue_name}`;
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `다음 공연의 관람 안내 공지를 웹에서 찾아 줘: ${q} (${c.date} ${c.start_time} 공연).
찾을 것: 입장 시작 시각, 구역별 입장 게이트, MD(굿즈) 부스 위치와 운영 시간, 포토존, 물품보관, 공식 셔틀·대절버스 승하차, 반입 금지 물품, 티켓 수령(현장 수령 장소·시간).
예매처(티켓링크·예스24·NOL 인터파크·멜론티켓), 소속사·공식 SNS, 공식 팬카페 공지를 우선하고, 기사·블로그는 보조로만 써.
이 공연(날짜·장소가 같은 것)의 정보만 쓰고, 지난 공연이나 다른 공연 정보는 쓰지 마. 못 찾은 항목은 "공지 없음"이라고 써.
결과는 항목별로 짧게, 각 문장 뒤에 출처 링크를 붙여.`,
  }];
  let text = "";
  const sources = new Map<string, string>();
  for (let turn = 0; turn < 3; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    await recordUsage("notice_watch", MODEL, res.usage);
    for (const b of res.content) {
      if (b.type === "text") text += b.text;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") sources.set(r.url, r.title);
      }
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  if (!text.trim()) throw new Error("검색 결과를 정리하지 못했어요");
  const extract = await extractNotice(text, c.title, c.venue_name);
  return { text: text.slice(0, 6000), sources: [...sources.entries()].slice(0, 12).map(([url, title]) => ({ url, title })), extract };
}
