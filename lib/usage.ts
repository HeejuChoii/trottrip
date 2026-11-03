// Claude API 사용량·예산 (PRD 9장: 해커톤 크레딧 $50, 11/6 이후 사용 불가)
import "server-only";
import { addUsage, sumUsage } from "./db.ts";

// 1M 토큰당 USD (Claude API 표준 단가)
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

export function costOf(model: string, input: number, output: number): number {
  const p = PRICE[model] ?? PRICE["claude-opus-5-5"];
  return (input * p.in + output * p.out) / 1_000_000;
}

export async function recordUsage(kind: string, model: string, usage: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | undefined) {
  if (!usage) return;
  const input = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const output = usage.output_tokens ?? 0;
  try { await addUsage({ kind, model, input_tokens: input, output_tokens: output, cost_usd: costOf(model, input, output) }); }
  catch (e) { console.warn("[usage] 기록 실패", e instanceof Error ? e.message : e); }
}

export function budgetUsd(): number {
  return Number(process.env.ANTHROPIC_BUDGET_USD ?? 45);
}

/** 예산이 남았는지 (남은 금액이 0 이하이면 새 AI 호출을 하지 않는다) */
export async function budgetLeft(): Promise<{ ok: boolean; spent: number; budget: number }> {
  const spent = await sumUsage().catch(() => 0);
  const budget = budgetUsd();
  return { ok: spent < budget, spent, budget };
}
