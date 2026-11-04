// Croche 없이(가짜 opener) 서버·풀·도구를 검사한다. croche.ai에 접속할 수 없는 환경에서도 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createServer } from "../src/server.ts";
import { AgentPool, LimitError } from "../src/agent/pool.ts";
import type { AgentOpener, TurnState } from "../src/agent/croche.ts";
import { sign, SIG_HEADER, TS_HEADER, type ChatRequest } from "../src/protocol.ts";
import { addAction, findPlaces, stripMarkers } from "../src/tools.ts";

const TRIP = "0b6e3a4e-8c1f-4a7e-9a39-7b1f2c3d4e5f";
const req = (q: string, trip = TRIP): ChatRequest => ({
  trip_id: trip, message_id: crypto.randomUUID(), q, now: "14:10",
  parent_honorific: "어머니", kid_honorific: "따님", kid_phone: "",
  concert: { title: "공연", venue: "코엑스 D홀", date: "2026-12-25", start_time: "17:00", est_end_time: "19:30", notice: "" },
  seat: "B구역", gate: "3번 입구", info_desk: "안내소",
  items: [{ id: "i1", start: "16:20", end: "17:00", type: "enter", title: "입장", place_id: null, parent_text: "", done: false }],
  places: [
    { id: "wc2", name: "2층 화장실", category: "toilet", walk_min: 3, description: "2층", tags: [], fan_type: "none" },
    { id: "wc1", name: "엘리베이터 옆 화장실", category: "toilet", walk_min: 1, description: "엘리베이터 옆", tags: [], fan_type: "none" },
  ],
});

// 가짜 에이전트: 질문에 "화장실"이 있으면 도구를 쓰는 것처럼 state를 채운다
function fakeOpener(log: string[]): AgentOpener {
  return async (userId: string, state: TurnState) => ({
    async ask(text) {
      log.push(`${userId}:start:${text}`);
      await new Promise((r) => setTimeout(r, 20));
      log.push(`${userId}:end:${text}`);
      if (text.includes("화장실")) {
        const r = findPlaces(state.req!, "toilet");
        r.found.forEach((p) => state.placeIds.push(p.id));
        return { text: `${r.found[0].name}이 가까워요. 걸어서 1분이에요.`, markers: [], status: "completed" };
      }
      if (text.includes("어디 가")) {
        addAction(state.actions, state.req!, "schedule", "i1");
        addAction(state.actions, state.req!, "map", "wc1");
        assert.equal(addAction(state.actions, state.req!, "map", "nope").shown, false);
        return { text: "지금은 입장하실 시간이에요. 아래 버튼을 누르세요.", markers: [], status: "completed" };
      }
      return { text: "그건 확인이 필요해요. : unknown :", markers: [], status: "completed" };
    },
    async close() { log.push(`${userId}:close`); },
  });
}

test("tools: 가까운 순, 없으면 빈 결과", () => {
  const r = findPlaces(req("x"), "toilet");
  assert.equal(r.found[0].id, "wc1");
  assert.equal(findPlaces(req("x"), "locker").found.length, 0);
  assert.deepEqual(stripMarkers("확인이 필요해요. ：Unknown：").markers, ["unknown"]);
});

test("pool: 같은 사용자 직렬화, 인스턴스 재사용, 장소 id·unknown 처리", async () => {
  const log: string[] = [];
  let opens = 0;
  const base = fakeOpener(log);
  const pool = new AgentPool(async (u, s) => { opens++; return base(u, s); }, { maxOpen: 10, idleMs: 1000, perUserDaily: 10, globalHourly: 100 });
  const [a, b] = await Promise.all([pool.ask(req("화장실 어디야?"), {}), pool.ask(req("사인회 해?"), {})]);
  assert.equal(opens, 1);
  assert.deepEqual(log.slice(0, 4), [`${TRIP}:start:화장실 어디야?`, `${TRIP}:end:화장실 어디야?`, `${TRIP}:start:사인회 해?`, `${TRIP}:end:사인회 해?`]);
  assert.equal(a.place_id, "wc1");
  assert.equal(a.needs_check, false);
  assert.equal(b.needs_check, true);
  assert.equal(b.place_id, null);
  assert.ok(!b.text.includes("unknown"));
  assert.deepEqual(a.actions.map((x) => x.type), ["map"]); // 장소 안내 → 지도 버튼 자동
  const c = await pool.ask(req("공연 1시간 남았는데 어디 가야 해?"), {});
  assert.deepEqual(c.actions.map((x) => x.type), ["schedule", "map"]);
  assert.equal(b.actions.length, 0);
  await pool.closeAll();
});

test("pool: 사용자별 상한", async () => {
  const pool = new AgentPool(fakeOpener([]), { maxOpen: 10, idleMs: 1000, perUserDaily: 1, globalHourly: 100 });
  await pool.ask(req("화장실"), {});
  await assert.rejects(pool.ask(req("화장실"), {}), LimitError);
  await pool.closeAll();
});

test("server: 서명 없으면 401, 맞으면 200", async () => {
  const { server, pool } = createServer(fakeOpener([]), "s3cret");
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/chat`;
  const body = JSON.stringify(req("화장실 어디야?"));
  let r = await fetch(url, { method: "POST", body });
  assert.equal(r.status, 401);
  const ts = String(Date.now());
  r = await fetch(url, { method: "POST", body, headers: { [TS_HEADER]: ts, [SIG_HEADER]: sign("s3cret", ts, body) } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).place_id, "wc1");
  const bad = JSON.stringify({ ...req("x"), trip_id: "../../etc" });
  r = await fetch(url, { method: "POST", body: bad, headers: { [TS_HEADER]: ts, [SIG_HEADER]: sign("s3cret", ts, bad) } });
  assert.equal(r.status, 400);
  server.close();
  await pool.closeAll();
});
