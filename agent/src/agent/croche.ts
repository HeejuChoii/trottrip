// Croche를 여는 유일한 파일 (CROCHE.md 규칙 8). SDK가 바뀌면 여기만 고친다.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Croche, type ToolDeclaration, type ToolHandler } from "@h1r-ai/croche";

type Json = Awaited<ReturnType<ToolHandler>>;
/** 도구 결과를 JSON 값으로(undefined 필드 제거) */
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Json;
import { FileStorage } from "@h1r-ai/croche/node";
import type { ChatAction, ChatRequest } from "../protocol.ts";
import { addAction, CATEGORIES, findPlaces, gateInfo, schedule } from "../tools.ts";

export interface AgentHandle {
  /** 한 번 묻고 최종 답을 받는다 */
  ask(text: string, context: unknown, id?: string): Promise<{ text: string; markers: string[]; status: string; error?: string }>;
  close(): Promise<void>;
}

/** 지금 처리 중인 요청 자료. 도구 handler가 읽는다(사용자별로 직렬화되므로 안전) */
export interface TurnState {
  req: ChatRequest | null;
  placeIds: string[]; // 이번 턴에 도구가 돌려준 장소 id
  actions: ChatAction[]; // 이번 턴에 띄울 버튼
}

export type AgentOpener = (userId: string, state: TurnState) => Promise<AgentHandle>;

export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./.croche-data");

/** 사용자별 비공개 저장 경로. userId는 호출 전에 UUID 검사를 거친다(규칙 2) */
export function storageDirFor(userId: string): string {
  return path.join(DATA_DIR, "users", userId);
}

export const INSTRUCTIONS = `너는 트롯트립의 "물어보기" 안내 도우미다. 트로트 공연장에 혼자 또는 친구와 오신 50~70대 부모님의 질문에 답한다.

말투
- 쉬운 존댓말로 2~3문장. 어려운 외래어·영어·이모지 금지. 어디서, 걸어서 몇 분인지 먼저 말한다.

근거
- 사실은 오직 도구 결과와 이번 턴의 context(공연·좌석·일정)에서만 가져온다.
- 장소(화장실, 엘리베이터, 쉼터, 식당, 굿즈 부스, 입구, 안내소, 물품 보관, 버스 승하차 등)를 물으면 반드시 venue find로 찾는다.
- 일정·지금 할 일·버스 시각은 venue schedule, 좌석·입구는 venue gate로 확인한다.

버튼 (말만 하지 말고 화면으로 데려간다)
- 일정 항목을 안내했으면(지금 할 일, 다음 갈 곳, 입장, 귀가 버스 등) screen show-schedule로 그 항목의 "일정에서 보기" 버튼을 띄운다.
- 가야 할 장소를 안내했으면 screen show-map으로 그 장소의 "지도에서 길찾기" 버튼을 띄운다. 지도에서 내 위치와 길 안내를 볼 수 있다.
- 예: "공연 1시간 남았는데 어디 가야 해?" → venue schedule로 지금 할 일을 확인 → 두세 문장으로 안내 → show-schedule(그 항목) + show-map(그 항목의 장소).
- id는 도구 결과에 나온 것만 쓴다. 버튼을 띄웠으면 답에 "아래 버튼을 누르시면 …" 정도로 짧게 알려 준다.
- 도구 결과가 비어 있거나 근거가 없으면 절대 지어내지 않는다(사인회, 메뉴, 가격, 셔틀 시간표 등). 이때는 답 끝에 :unknown: 을 붙인다.
- 몸이 아프다, 어지럽다, 숨이 차다 같은 말에는 첫 문장을 "119에 전화하시고 가까운 안전요원에게 알리세요."로 한다.

하지 않는 것
- 일정을 직접 바꾸지 않는다. 바꾸고 싶다 하시면 화면의 "일정 바꾸기" 버튼을 누르시라고 안내한다.
- 부모님의 위치를 묻거나 개인 정보를 묻지 않는다.`;

export const MARKER_GUIDE = `:unknown: 도구 결과와 context로 확인할 수 없는 질문이라 답할 수 없을 때만 답 끝에 붙인다. 그 밖에는 마커를 쓰지 않는다.`;

export const MEMORY_POLICY = `이 안내장은 공연 하루 동안만 쓰인다. 오늘 부모님이 불편하다고 하신 점(다리가 아프심, 계단이 힘드심 등)과 이미 안내한 장소만 짧게 기억한다. 이름·연락처·건강 정보의 자세한 내용은 저장하지 않는다.`;

const venueTool: ToolDeclaration = {
  name: "venue",
  summary: "오늘 공연장 주변 장소, 부모님의 일정, 좌석 입구를 찾아본다. 결과에 없으면 지어내지 않는다.",
  commands: [
    {
      key: "find_place", name: "find", reads: true,
      summary: "종류별로 공연장에서 가장 가까운 장소를 최대 2곳 찾는다. 결과가 비면 그 정보는 없다.",
      flags: [
        { name: "category", type: "string", required: true, enum: [...CATEGORIES], description: "restaurant 식당, cafe 카페, rest 쉼터, goods 굿즈 부스, photo 포토존, toilet 화장실, elevator 엘리베이터, gate 입구, info_desk 안내소, locker 물품 보관, bus_stop 버스 승하차, sight 관광지" },
        { name: "limit", type: "integer", minimum: 1, maximum: 3, default: 2 },
      ],
    },
    { key: "schedule", name: "schedule", reads: true, summary: "지금 할 일과 남은 일정(시각, 할 일, 귀가 버스 포함)을 본다." },
    { key: "gate", name: "gate", reads: true, summary: "부모님 좌석, 들어갈 입구, 입장 시작 시각을 본다." },
  ],
};

const screenTool: ToolDeclaration = {
  name: "screen",
  summary: "답 아래에 부모님이 누를 버튼을 띄운다. 누르면 일정 화면이나 지도(내 위치·길 안내)로 이동한다.",
  commands: [
    {
      key: "show_schedule", name: "show-schedule",
      summary: "안내한 일정 항목의 '일정에서 보기' 버튼을 띄운다.",
      flags: [{ name: "item-id", arg: "itemId", type: "string", required: true, description: "venue schedule 결과의 id" }],
    },
    {
      key: "show_map", name: "show-map",
      summary: "안내한 장소의 '지도에서 길찾기' 버튼을 띄운다.",
      flags: [{ name: "place-id", arg: "placeId", type: "string", required: true, description: "venue find 또는 schedule 결과의 place_id" }],
    },
  ],
};

function handlers(state: TurnState): Record<string, ToolHandler> {
  return {
    venue: (inv) => {
      const req = state.req;
      if (!req) return { status: "rejected", reason: "지금 처리 중인 질문이 없어요" };
      if (inv.key === "find_place") {
        const r = findPlaces(req, String(inv.args.category ?? ""), Number(inv.args.limit ?? 2));
        for (const p of r.found) state.placeIds.push(p.id);
        return json(r);
      }
      if (inv.key === "schedule") return json(schedule(req));
      if (inv.key === "gate") return json(gateInfo(req));
      return { status: "rejected", reason: "알 수 없는 동작" };
    },
    screen: (inv) => {
      const req = state.req;
      if (!req) return { status: "rejected", reason: "지금 처리 중인 질문이 없어요" };
      const r = inv.key === "show_schedule" ? addAction(state.actions, req, "schedule", String(inv.args.itemId ?? ""))
        : inv.key === "show_map" ? addAction(state.actions, req, "map", String(inv.args.placeId ?? ""))
        : { shown: false, reason: "알 수 없는 동작" };
      return json(r.shown ? { shown: true } : { status: "rejected", reason: r.reason ?? "" });
    },
  };
}

export const openCrocheAgent: AgentOpener = async (userId, state) => {
  const projectKey = process.env.CROCHE_PROJECT_KEY;
  if (!projectKey) throw new Error("CROCHE_PROJECT_KEY가 없어요");
  const keys = process.env.CROCHE_SERVER_KEY
    ? { serverKey: process.env.CROCHE_SERVER_KEY } // 운영
    : { debugKey: process.env.CROCHE_DEBUG_KEY! }; // 로컬 개발
  const croche = await Croche.open({
    projectKey,
    ...keys,
    user: userId, // Vercel 서명을 검증한 trip_id만
    storage: new FileStorage(storageDirFor(userId)),
    timeZone: "Asia/Seoul",
    config: {
      ...(process.env.CROCHE_MODEL ? { model: process.env.CROCHE_MODEL } : {}),
      defaultLanguage: "ko",
      instructions: INSTRUCTIONS,
      markerGuide: MARKER_GUIDE,
      tools: [venueTool, screenTool],
      maxIterations: 5, // 한 턴 도구 호출 반복 상한 (비용 보호): 확인 1~2회 + 버튼 1회
      maxOutputTokens: 400,
      memory: { policy: MEMORY_POLICY },
    },
    handlers: handlers(state),
  });
  const agent = await croche.agent();
  return {
    async ask(text, context, id = randomUUID()) {
      const r = await agent.request({ id, text, context: context as never });
      const last = r.messages.at(-1);
      return { text: last?.text ?? "", markers: last?.markers ?? [], status: last?.status ?? r.status, error: last?.error?.message };
    },
    async close() { await croche.close(); },
  };
};
