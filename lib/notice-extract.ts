// 공연 임박 공지(예매처 공지, 소속사 SNS, 팬카페 글 등)를 붙여 넣으면 Claude가 필요한 값만 뽑는다.
// 운영자가 확인한 뒤에만 저장한다(자동 저장 없음). 로그인이 필요한 곳은 긁어 오지 않는다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MODEL, aiEnabled } from "./ai.ts";
import { recordUsage } from "./usage.ts";

const NoticePlace = z.object({
  name: z.string().describe("짧은 이름. 예: 공식 MD 부스, 포토존, 3번 게이트, 퀸즈스마일 셔틀 하차"),
  category: z.enum(["goods", "photo", "gate", "bus_stop", "info_desk", "locker", "toilet", "rest", "elevator", "cafe", "restaurant"]),
  description_ko: z.string().describe("부모님이 찾아갈 수 있게 위치를 한 줄로. 공지 문장 그대로에 가깝게"),
  hours: z.string().describe("운영 시간이 있으면 '13:00~16:30'처럼, 없으면 빈 문자열"),
  location_query: z.string().describe("카카오맵에서 좌표를 찾을 검색어(건물·출구·주차장 이름). 모르면 빈 문자열"),
});

export const NoticeSchema = z.object({
  summary: z.string().describe("부모님께 보여 줄 공지 요약 2~3문장. 쉬운 존댓말"),
  gate_map: z.array(z.object({ zone: z.string().describe("구역. 예: B, VIP, 1층 A"), gate: z.string().describe("입구. 예: 3번 게이트") })),
  md_hours: z.string().describe("MD(굿즈) 부스 운영 시간. 없으면 빈 문자열"),
  entry_start: z.string().describe("입장 시작 시각 HH:MM. 없으면 빈 문자열"),
  places: z.array(NoticePlace),
  unclear: z.array(z.string()).describe("공지에 없거나 애매해서 사람이 확인해야 할 것"),
});
export type NoticeExtract = z.infer<typeof NoticeSchema>;

export async function extractNotice(text: string, concertTitle: string, venue: string): Promise<NoticeExtract> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY가 없어서 공지 정리를 할 수 없어요");
  const client = new Anthropic({ timeout: 40_000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(NoticeSchema) },
    system: `너는 공연 공지에서 공연장 안내 정보를 뽑는 도우미다. 공연: ${concertTitle} / 공연장: ${venue}.
- 공지에 적힌 것만 뽑는다. 추측하거나 지어내지 않는다. 확실하지 않으면 unclear에 적는다.
- 셔틀(퀸즈스마일, 버스타다, 카카오T 등)·대절버스 승하차 위치는 bus_stop으로.
- 굿즈 부스는 goods, 포토존·포토월은 photo, 게이트·입구는 gate.
- 팬들이 쓴 후기·꿀팁 모음이 들어올 수도 있다. 화장실(toilet)·엘리베이터(elevator)·물품보관(locker)·쉼터(rest)·카페(cafe)·식당(restaurant)·안내소(info_desk)처럼 공연장 시설 위치를 말한 문장만 장소로 뽑고, 개인 감상은 버린다. 여러 사람이 같은 곳을 말하면 하나로 합친다.`,
    messages: [{ role: "user", content: `공지 원문:\n"""\n${text.slice(0, 20000)}\n"""` }],
  });
  await recordUsage("notice", MODEL, res.usage);
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("공지를 정리하지 못했어요");
  return res.parsed_output;
}
