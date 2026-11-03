// 트롯트립 챗봇 서버 (Render). Vercel API만 호출한다(서버-서버, 서명 검증).
//   GET  /health → { ok: true }
//   POST /chat   → ChatRequest(서명) → ChatResponse
import http from "node:http";
import { AgentPool, LimitError } from "./agent/pool.ts";
import { openCrocheAgent, type AgentOpener } from "./agent/croche.ts";
import { isTripId, SIG_HEADER, TS_HEADER, verify, type ChatRequest } from "./protocol.ts";
import { schedule } from "./tools.ts";

const MAX_BODY = 256 * 1024;

export function turnContext(req: ChatRequest) {
  // 매 턴 넣는 앱 상태는 작게(토큰=비용). 장소 목록은 도구로 찾는다.
  const s = schedule(req);
  return {
    now: req.now,
    parent: req.parent_honorific,
    concert: req.concert,
    seat: req.seat || null,
    gate: req.gate,
    current: s.current ? { start: s.current.start, end: s.current.end, title: s.current.title } : null,
    info_desk: req.info_desk,
  };
}

export function createServer(opener: AgentOpener = openCrocheAgent, secret = process.env.AGENT_SHARED_SECRET ?? "") {
  const pool = new AgentPool(opener, {
    maxOpen: Number(process.env.MAX_OPEN_AGENTS ?? 100),
    idleMs: Number(process.env.AGENT_IDLE_MS ?? 15 * 60_000),
    perUserDaily: Number(process.env.PER_USER_DAILY ?? 30), // trip당 30회 (PRD 9장)
    globalHourly: Number(process.env.GLOBAL_HOURLY ?? 800), // 서버 키 한도(시간당 1,000회)보다 낮게
  });
  pool.start();

  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === "GET" && (req.url === "/health" || req.url === "/")) return send(200, { ok: true, service: "trottrip-agent", open: pool.size });
      if (req.method !== "POST" || req.url !== "/chat") return send(404, { error: "not_found" });

      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return send(413, { error: "too_large" });
      }
      if (!verify(secret, req.headers[TS_HEADER] as string, req.headers[SIG_HEADER] as string, raw)) return send(401, { error: "bad_signature" });
      const body = JSON.parse(raw) as ChatRequest;
      if (!isTripId(body.trip_id) || typeof body.q !== "string" || !body.q.trim() || !Array.isArray(body.places) || !Array.isArray(body.items)) {
        return send(400, { error: "bad_request" });
      }
      body.q = body.q.slice(0, 300);
      const out = await pool.ask(body, turnContext(body));
      return send(200, out);
    } catch (e) {
      if (e instanceof LimitError) return send(429, { error: e.code, message: e.message });
      console.error("[chat]", e instanceof Error ? e.message : e);
      return send(502, { error: "agent_failed" });
    }
  });
  return { server, pool };
}

// 직접 실행할 때만 서버를 켠다(테스트에서 import 시에는 켜지 않음)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.AGENT_SHARED_SECRET) throw new Error("AGENT_SHARED_SECRET가 없어요");
  const { server, pool } = createServer();
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, process.env.HOST ?? "0.0.0.0", () => console.log(`[agent] listening on ${port}`));
  const stop = async () => { server.close(); await pool.closeAll(); process.exit(0); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
