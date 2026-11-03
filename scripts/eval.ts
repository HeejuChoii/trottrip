// npm run eval — 규칙 엔진으로 평가 세트 10개를 돌리고 결과를 출력한다(키 불필요).
// AI 포함 결과는 배포 후 /admin의 "평가 실행" 버튼으로 본다.
import { readFileSync, writeFileSync } from "node:fs";
import { parsePlacesUpload } from "../lib/concertrip.ts";
import { buildRulePlan } from "../lib/planner.ts";
import { formatReport, runEval } from "../lib/eval.ts";
import { SEED_CONCERTS } from "../lib/seed.ts";
import type { ConcertView } from "../lib/types.ts";

const { places } = parsePlacesUpload(readFileSync(new URL("../data/sample-places-coex.json", import.meta.url), "utf8"), "psj");
const concert: ConcertView = { ...SEED_CONCERTS[0], custom: false, gate_map: { A: "1번 입구", B: "3번 입구", C: "3번 입구" } };
const r = await runEval(concert, places, (input) => buildRulePlan(input));
const report = formatReport(r);
console.log(report);
if (process.argv.includes("--out")) writeFileSync(new URL("../eval-results.md", import.meta.url), "```\n" + report + "\n```\n");
process.exit(r.passed === r.total ? 0 : 1);
