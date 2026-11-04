// 식당 맵기 AI 추정 라벨 (작은 모델 1회 호출로 여러 곳을 한꺼번에).
// 카카오는 메뉴를 API로 주지 않고, 메뉴판을 긁어 오는 건 약관 위반이라 이름·분류만으로 추정한다.
// 결과는 "AI 추정"으로만 쓰고, 화면과 kid_note에 그렇게 표시한다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { SMALL_MODEL, aiEnabled } from "./ai.ts";
import { budgetLeft, recordUsage } from "./usage.ts";
import type { Place } from "./types.ts";

const LabelSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    spice: z.enum(["mild", "medium", "spicy", "unknown"]).describe("mild: 대표 메뉴가 맵지 않거나 안 매운 메뉴가 많음 / medium: 맵기 선택 가능·반반 / spicy: 대표 메뉴가 매움 / unknown: 판단 불가"),
    note: z.string().describe("근거 한 줄, 25자 이내. 예: 국밥·설렁탕류라 맵지 않아요"),
    soup: z.boolean().nullable().describe("대표 메뉴가 국·탕·찌개·국밥·칼국수처럼 국물 요리면 true, 아니면 false, 모르면 null"),
    staple: z.enum(["rice", "noodle", "bread", "mixed", "unknown"]).describe("대표 메뉴의 주식"),
    raw: z.boolean().nullable().describe("회·초밥·육회처럼 날것이 대표 메뉴면 true, 아니면 false, 모르면 null"),
  })),
});

export interface FoodLabel { spice: Place["ai_spice"]; note: string; soup: boolean | null; staple: Place["ai_staple"]; raw: boolean | null }

export async function labelSpice(places: Place[]): Promise<Map<string, FoodLabel>> {
  const out = new Map<string, FoodLabel>();
  const targets = places.filter((p) => p.category === "restaurant");
  if (!targets.length || !aiEnabled() || !(await budgetLeft()).ok) return out;
  const client = new Anthropic({ timeout: 40_000, maxRetries: 1 });
  for (let i = 0; i < targets.length; i += 60) {
    const chunk = targets.slice(i, i + 60);
    try {
      const res = await client.beta.messages.parse({
        model: SMALL_MODEL,
        max_tokens: 6000,
        output_config: { effort: "low", format: betaZodOutputFormat(LabelSchema) },
        system: "너는 한국 식당의 이름과 카카오 분류만 보고 대표 메뉴의 맵기, 국물 요리 여부, 주식(밥/면/빵), 날것 여부를 추정한다. 모르면 unknown/null. 메뉴를 지어내지 말고 이름·분류에서 알 수 있는 것만 근거로 쓴다.",
        messages: [{ role: "user", content: JSON.stringify(chunk.map((p) => ({ id: p.id, name: p.name, category: p.category_detail ?? "" }))) }],
      });
      await recordUsage("label", SMALL_MODEL, res.usage);
      for (const x of res.parsed_output?.items ?? []) if (chunk.some((p) => p.id === x.id)) out.set(x.id, { spice: x.spice, note: x.note.slice(0, 40), soup: x.soup, staple: x.staple, raw: x.raw });
    } catch (e) {
      console.warn("[label] 맵기 추정 실패:", e instanceof Error ? e.message : e);
    }
  }
  return out;
}
