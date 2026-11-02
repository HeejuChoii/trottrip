// 사용자(안내장)별 에이전트 관리 (CROCHE.md 규칙 1·3·4·5·9)
// - 같은 사용자는 열린 인스턴스를 재사용
// - 같은 사용자의 요청은 순서대로 처리
// - 오래 안 쓴 인스턴스는 닫는다(저장 폴더는 지우지 않는다)
// - 동시 인스턴스 수, 사용자별 질문 수, 서버 전체 시간당 요청 수 상한
import type { ChatRequest, ChatResponse } from "../protocol.ts";
import { stripMarkers } from "../tools.ts";
import type { AgentHandle, AgentOpener, TurnState } from "./croche.ts";

export interface PoolOptions {
  maxOpen: number;
  idleMs: number;
  perUserDaily: number;
  globalHourly: number;
  now?: () => number;
}

interface Entry {
  handle: Promise<AgentHandle>;
  state: TurnState;
  queue: Promise<unknown>;
  lastUsed: number;
  busy: number;
}

export class LimitError extends Error {
  constructor(message: string, public code: "user_limit" | "global_limit" | "pool_full") { super(message); }
}

export class AgentPool {
  private entries = new Map<string, Entry>();
  private userCounts = new Map<string, { day: string; n: number }>();
  private hourWindow: number[] = [];
  private timer: NodeJS.Timeout | null = null;
  private now: () => number;

  constructor(private opener: AgentOpener, private opts: PoolOptions) {
    this.now = opts.now ?? Date.now;
  }

  start() {
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
  }

  get size() { return this.entries.size; }

  private checkLimits(userId: string) {
    const t = this.now();
    this.hourWindow = this.hourWindow.filter((x) => t - x < 3_600_000);
    if (this.hourWindow.length >= this.opts.globalHourly) throw new LimitError("지금 질문이 많아요. 잠시 후 다시 물어봐 주세요.", "global_limit");
    const day = new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
    const c = this.userCounts.get(userId);
    const n = c && c.day === day ? c.n : 0;
    if (n >= this.opts.perUserDaily) throw new LimitError("오늘 물어볼 수 있는 횟수를 다 쓰셨어요.", "user_limit");
    this.userCounts.set(userId, { day, n: n + 1 });
    this.hourWindow.push(t);
  }

  private async entryFor(userId: string): Promise<Entry> {
    let e = this.entries.get(userId);
    if (e) return e;
    if (this.entries.size >= this.opts.maxOpen) {
      await this.sweep(0);
      if (this.entries.size >= this.opts.maxOpen) throw new LimitError("지금 사용자가 많아요. 잠시 후 다시 물어봐 주세요.", "pool_full");
    }
    const state: TurnState = { req: null, placeIds: [], actions: [] };
    e = { handle: this.opener(userId, state), state, queue: Promise.resolve(), lastUsed: this.now(), busy: 0 };
    this.entries.set(userId, e);
    e.handle.catch(() => this.entries.delete(userId)); // 열기 실패 시 다음 요청에서 다시 연다(자동 재시도 루프 없음)
    return e;
  }

  /** 질문 하나. 같은 사용자는 앞 질문이 끝난 뒤에 처리 */
  async ask(req: ChatRequest, context: unknown): Promise<ChatResponse> {
    const userId = req.trip_id;
    this.checkLimits(userId);
    const e = await this.entryFor(userId);
    e.busy++;
    const run = e.queue.then(async () => {
      const handle = await e.handle;
      e.state.req = req;
      e.state.placeIds = [];
      e.state.actions = [];
      try {
        const r = await handle.ask(req.q, context, req.message_id);
        if (r.status !== "completed" || !r.text) throw new Error(r.error || `turn ${r.status}`);
        const s = stripMarkers(r.text);
        const markers = [...r.markers.map((m) => m.toLowerCase()), ...s.markers];
        const ids = new Set(req.places.map((p) => p.id));
        const placeId = e.state.placeIds.find((id) => ids.has(id) && s.text.includes(req.places.find((p) => p.id === id)!.name)) ?? e.state.placeIds.find((id) => ids.has(id)) ?? null;
        const unknown = markers.includes("unknown");
        const actions = unknown ? [] : [...e.state.actions];
        // 장소를 찾아 안내했는데 지도 버튼을 안 띄웠으면 하나 붙여 준다
        if (!unknown && placeId && !actions.some((a) => a.type === "map")) {
          const p = req.places.find((x) => x.id === placeId)!;
          actions.push({ type: "map", place_id: placeId, label: `지도에서 길찾기 · ${p.name}` });
        }
        return { text: s.text, needs_check: unknown, place_id: unknown ? null : placeId, actions };
      } finally {
        e.state.req = null;
        e.lastUsed = this.now();
      }
    });
    e.queue = run.catch(() => undefined);
    try { return await run; } finally { e.busy--; }
  }

  /** idleMs 넘게 안 쓴(처리 중이 아닌) 인스턴스 닫기 */
  async sweep(idleMs = this.opts.idleMs) {
    const t = this.now();
    for (const [id, e] of this.entries) {
      if (e.busy > 0 || t - e.lastUsed < idleMs) continue;
      this.entries.delete(id);
      try { await (await e.handle).close(); } catch { /* 이미 닫힘 */ }
    }
  }

  async closeAll() {
    if (this.timer) clearInterval(this.timer);
    await this.sweep(-1);
  }
}
