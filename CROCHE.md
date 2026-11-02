# Croche 개발 안내서 (코딩 에이전트용)

이 문서는 이 레포에서 AI 챗봇을 만드는 코딩 에이전트가 먼저 읽는 Croche 안내서다.
작성 기준: 손민수랩이 덕메(SNU × Croche AI Hackathon 2026 1등, H1R AI 디자인 파트너)를 만들며 실제로 쓴 방식. SDK `@h1r-ai/croche` 0.5.4.
SDK는 빠르게 바뀌고 있다. 이 문서와 실제 동작이 다르면 **`node_modules/@h1r-ai/croche`의 README와 타입이 정답**이다.

---

## 1. Croche가 뭔가

Croche는 H1R AI(하이어에이아이)가 만든 **AI 에이전트 런타임 + SDK**다. 챗봇의 "하네스"(대화 루프, 기억, 도구 호출, 모델 호출, 사용량 기록)를 대신 만들어 준다. 우리는 화면과 데이터, 도구 실행 코드만 쓰면 된다.

> 판단과 기억은 Croche 에이전트가, 실행과 데이터는 우리 앱이.

| 기능 | 하는 일 | 우리가 할 일 |
|---|---|---|
| **Memory** | 사용자에 대해 오래 기억할 것(장기)과 이번 대화만의 것(세션)을 나눠 저장하고, 다음 대화에 필요한 것만 꺼내 씀 | `memory.policy`에 "무엇을 언제 저장할지" 문장으로 지시 |
| **Context** | 매 턴 우리 앱의 실제 상태(DB 값 등)를 대화 이력과 별개로 넣어 줌 | `agent.send({ text, context })`에 JSON으로 넣기 |
| **Tool** | 모델이 언제 어떤 도구를 쓸지 판단 → 우리 코드(handler)가 실행 → 결과를 모델에 돌려줌 | 도구 선언(declaration) + 실행 함수(handler) 작성 |
| **Marker** | `:happy:` 같은 짧은 표식으로 캐릭터 표정·연출을 도구 호출 없이 싸게 표현 | `markerGuide`에 마커 목록과 쓰는 상황 지시, 화면에서 표정 처리 |
| **Studio** | 웹 콘솔. 프로젝트·키 발급, 대화 Logs, 사용량·비용 확인 | 키 발급, 디버깅 때 Logs 확인 |

모델은 `config.model`로 고른다(덕메는 `deepseek/deepseek-v4.1-flash`, 시연 시나리오 1회 약 9원).

---

## 2. 키 3종류 (가장 많이 헷갈리는 부분)

| 키 | 모양 | 어디서 | 어디에 쓰나 |
|---|---|---|---|
| **프로젝트 키** | `pk_…` | Studio 프로젝트 화면 | 어떤 프로젝트인지 식별. 공개돼도 되지만 환경변수 `CROCHE_PROJECT_KEY`로 관리 |
| **디버그 키(계정 키)** | Studio "내 계정 키" | Studio 계정 설정 | **로컬 개발 전용.** `.env`의 `CROCHE_DEBUG_KEY` |
| **서버 키** | `csk_…` | Studio 프로젝트 → 키 → **서버 키 발급** | **운영 배포 전용.** 배포 서버 환경변수 `CROCHE_SERVER_KEY` |

- 서버 키 없이 돌리면 IP당 시간당 100회, 서버 키는 키당 시간당 1,000회 제한(0.5.4 기준).
- 디버그 키·서버 키는 **서버에만** 둔다. 브라우저 번들, 프런트엔드 환경변수(`NEXT_PUBLIC_*`), 깃, 채팅 어디에도 넣지 않는다.
- 키 값은 사람이 직접 배포 플랫폼(Render) 대시보드에 입력한다. 코딩 에이전트는 키 이름만 다룬다.

---

## 3. 배포 구조: 서비스는 Vercel, 챗봇 서버는 Render

**Croche 웹 SDK는 서버리스(Vercel Functions 등)를 지원하지 않는다.** 사용자마다 에이전트를 열어 둔 채로 대화하고, 기억을 서버 폴더(FileStorage)에 저장하기 때문이다. 그래서 둘로 나눈다.

```
[브라우저] ──(화면)──> [Vercel: 서비스 본체 (Next.js 등)]
     │                          │  ① 로그인/사용자 확인 후
     │                          │     짧게 유효한 서명 토큰 발급 (userId 포함)
     │ ② 토큰과 함께 채팅 요청·SSE 연결
     ▼
[Render: 챗봇 에이전트 서버 (Node, 항상 켜짐 + 디스크 /data)]
     └─ Croche SDK ── 사용자별 에이전트 ── /data/users/<userId>/
```

- **Render 쪽**: Node 서버 1개(Web Service, Starter 이상), 영구 디스크를 `/data`에 연결, 리전 `singapore`(한국과 가까움). 디스크 붙은 서비스는 인스턴스 1개로만 돈다 → 저장 폴더 소유자가 하나로 유지돼서 오히려 맞다.
- **사용자 ID는 Vercel(서비스 본체)이 정한다.** 로그인한 사용자 ID(또는 익명 ID)를 HMAC 서명 토큰(예: 5~10분 유효)으로 만들어 브라우저에 주고, 브라우저는 그 토큰으로 Render에 붙는다. Render는 서명을 검증한 userId만 믿는다. 두 서버가 같은 비밀값 `AGENT_SHARED_SECRET`을 환경변수로 공유.
- Render 서버에 CORS 허용 도메인 = Vercel 도메인만.
- 더 단순한 대안: Vercel API Route가 서버-서버로 Render에 요청을 대신 보내는 프록시. 단 스트리밍 응답이 Vercel 함수 실행 시간 제한에 걸릴 수 있어서, 실시간 채팅이면 위의 "브라우저 → Render 직접 연결 + 서명 토큰"을 추천.

---

## 4. 지켜야 할 운영 규칙 (Studio 서버 키 안내 + 덕메 경험)

1. **사용자 하나에 Runtime 하나.** 같은 사용자는 열려 있는 인스턴스를 재사용한다. 요청마다 새로 열지 않는다.
2. **사용자별 비공개 영구 저장 경로**를 서버가 정한다: `path.join(DATA_DIR, "users", userId)`. 요청 값(바디, 쿼리)을 파일 경로에 직접 쓰지 않는다. userId는 형식 검사(UUID 등) 후에만 사용.
3. **경로 하나에 소유자 하나.** 같은 폴더를 두 프로세스·두 인스턴스가 동시에 열면 `store_busy` 에러가 난다(로컬에서 서버를 두 번 켰을 때도 같은 에러).
4. **한 사용자에 대한 요청은 순서대로(직렬화).** 이전 턴이 끝나기 전에 같은 사용자의 다음 send를 겹쳐 보내지 않는다.
5. 오래 안 쓴 인스턴스는 `close()`로 닫는다. **저장 폴더는 지우지 않는다**(기억이 거기 있다). 동시 인스턴스 상한을 둔다.
6. **이벤트는 그 사용자 화면에만** 보낸다. 전체 방송(broadcast) 금지 — 덕메 초기 버전에서 모든 방문자 대화가 섞였던 버그의 원인.
7. 네트워크 오류 시 **재시도 루프 금지**(실패 호출도 비용이 잡힐 수 있음).
8. **Croche 호출은 한 모듈(`src/agent/`)에만.** SDK가 자주 바뀌어서(11월 새 버전 마이그레이션 예정) 그 파일만 고치면 되게.
9. 비용 보호: 사용자당 메시지 수, 서버 전체 시간당 요청 수, 한 턴 Tool 호출 수 상한.
10. SDK는 0.5.4 이상(Runtime 열고 닫을 때 메모리 누수 수정).

---

## 5. 코드 예시 (덕메에서 실제로 쓴 형태, TypeScript / Node)

설치: `npm i @h1r-ai/croche`

### 에이전트 열기

```ts
import { Croche } from "@h1r-ai/croche";
import { FileStorage } from "@h1r-ai/croche/node";

export async function openAgent(userId: string, onEvent: (e: any) => void) {
  const croche = await Croche.open({
    projectKey: process.env.CROCHE_PROJECT_KEY!,
    ...(process.env.CROCHE_SERVER_KEY
      ? { serverKey: process.env.CROCHE_SERVER_KEY }       // 운영
      : { debugKey: process.env.CROCHE_DEBUG_KEY! }),     // 로컬 개발
    user: userId,                                          // 서버가 검증한 ID만
    storage: new FileStorage(storageDirFor(userId)),       // DATA_DIR/users/<userId>
    config: {
      model: "deepseek/deepseek-v4.1-flash",
      defaultLanguage: "ko",           // Node 기본값은 en
      instructions: INSTRUCTIONS,      // 시스템 프롬프트(역할, 말투, 원칙)
      markerGuide: MARKER_GUIDE,       // ":happy: 기쁠 때 …" 식의 마커 사용 규칙
      tools: toolDeclarations,         // 도구 선언 배열
      maxIterations: 12,               // 한 턴 안 도구 호출 반복 상한
      memory: { policy: MEMORY_POLICY }, // 무엇을 언제 기억할지
    },
    handlers: toolHandlers,            // { 도구이름: handler }
  });
  const agent = await croche.agent();  // 메인 에이전트(agentId 생략 = "default")
  const sub = agent.subscribe({ onEvent });
  return {
    send: (text: string, context: unknown) =>
      agent.send({ id: crypto.randomUUID(), text, context }),
    memoryList: () => agent.memory.list(),      // [{ id, text }]
    memoryDelete: (id: string) => agent.memory.delete(id),
    memoryClear: () => agent.memory.clear(),    // 턴 도중이면 끝난 뒤로 미뤄짐
    clearHistory: () => agent.clearHistory(),   // 대화창만 비우기(기억은 유지)
    close: async () => { sub.close(); await croche.close(); },
  };
}
```

- Studio 예제에는 `CrocheRuntime.create({ projectKey, agentId: "companion", serverKey, user, storage, instructions })`가 나온다. README상 "프로젝트 없이 에이전트 하나를 여는 같은 Core"다. 도구·마커·기억 정책 같은 config가 필요하면 `Croche.open`을 쓴다. 한 저장소를 다른 agentId로 다시 열면 `identity_conflict`가 나니 하나로 정해서 유지.

### 도구(Tool) 만들기

```ts
import type { ToolDeclaration, ToolHandler } from "@h1r-ai/croche";

export const addWishlistDeclaration: ToolDeclaration = {
  name: "addWishlist",
  summary: "사용자가 찜하겠다고 명확히 말했을 때만 위시리스트에 추가한다.", // 모델이 '언제 쓸지' 판단하는 근거
  commands: [{
    key: "add_wishlist", name: "add", reads: false,
    summary: "itemId를 위시리스트에 추가한다.",
    flags: [{ name: "itemId", type: "string", required: true, description: "찜할 아이템 id" }],
  }],
};

export const addWishlistHandler: ToolHandler = async (invocation, context) => {
  if (invocation.key !== "add_wishlist") return { status: "rejected", reason: "알 수 없는 동작" };
  const { itemId } = invocation.args as { itemId: string };
  // context.user = 이 턴의 사용자 ID. 우리 DB/상태를 실제로 바꾼다.
  return { status: "ok", added: true, itemId };   // JSON으로 돌려주면 모델이 읽고 답한다
};
```

팁
- 결과가 많으면 도구가 걸러서 상위 몇 개만 돌려준다(덕메: 성지 521곳 중 최대 5개). 토큰 = 비용.
- "데이터에 없으면 빈 배열 → 지어내지 말고 '확인되지 않은 정보'라고 답하라"를 summary와 instructions에 같이 쓴다.
- 지역명·이름처럼 사용자가 여러 언어로 말하는 값은 도구 안에서 정규화한다(덕메: Seoul/首尔/ソウル → 서울).

### 매 턴 context 넣기

```ts
await handle.send(userText, {
  personalProfile: { favorite: "NCT WISH 사쿠야", budget: 100000 },
  wishlist: [...], ownedItems: [...],
  replyLanguage: "en",
  replyInstruction: "Reply only in English.",
});
```
앱의 "진짜 상태"는 Croche 기억에만 맡기지 말고 우리 DB에 두고 매 턴 context로 넣는다(기억 누락 대비 + 화면과 일치).

### 이벤트(스트리밍) 받기 — 덕메에서 쓴 것

- `input` (kind: "user"): 사용자 입력 접수
- `message.delta`: 답변 글자가 조각으로 옴 → 말풍선에 이어 붙이기
- `message.end`: 답변 완료(최종 텍스트, 마커 목록 포함)
- `state`: `status`("running" / "idle"), `activity`("tool" 등) → "찾는 중…" 표시, 턴 종료 처리

서버는 이 이벤트를 **그 사용자의** SSE 연결로만 보낸다. 정확한 필드는 SDK 타입을 확인.

### 마커 처리 주의
모델이 `:happy:`를 `: happy:`처럼 공백을 넣어 보낼 때가 있다. 화면에서 지울 때 공백·전각 콜론·대소문자를 느슨하게 잡고, 스트리밍 조각 경계에서 잘린 경우도 숨긴다.

---

## 6. Render 배포 템플릿 (`render.yaml`)

```yaml
services:
  - type: web
    name: <서비스이름>-agent
    runtime: node
    region: singapore          # 만든 뒤에는 못 바꿈
    plan: starter              # 디스크는 유료 인스턴스에서만
    buildCommand: npm ci
    startCommand: npm run start:prod
    healthCheckPath: /health
    disk:
      name: agent-data
      mountPath: /data
      sizeGB: 1
    envVars:
      - key: CROCHE_PROJECT_KEY
        sync: false            # 값은 Render 대시보드에서 사람이 입력
      - key: CROCHE_SERVER_KEY
        sync: false
      - key: AGENT_SHARED_SECRET
        sync: false            # Vercel과 같은 값
      - key: ALLOWED_ORIGIN
        value: https://<vercel-도메인>
      - key: DATA_DIR
        value: /data
      - key: NODE_ENV
        value: production
      - key: NODE_VERSION
        value: "22"
```

- `PORT`는 Render가 주는 환경변수를 따르고 `HOST=0.0.0.0`.
- `GET /health` → `{ ok: true }`.
- TypeScript를 tsx로 바로 실행하면 `tsx`를 dependencies(운영)에 둔다.
- Render 무료 플랜은 15분 무사용 시 잠들고 디스크도 없다 → 시연·운영엔 Starter.
- 참고: Railway는 2026-10 기준 신규 가입이 막혀 있었다.

---

## 7. 개발할 때 알아둘 것

- **클라우드 코딩 환경(Claude Code 웹 등)에서는 croche.ai 접속이 막혀 있을 수 있다.** 이 경우 코드는 여기서 쓰고, 실제 대화 테스트는 노트북(`.env`에 디버그 키) 또는 배포 URL에서 한다. 테스트는 Croche를 가짜 opener로 바꿔 끼워서 돌릴 수 있게 설계한다.
- 같은 저장 폴더를 쓰는 서버를 두 번 켜면 `store_busy`. 기존 프로세스를 끄고 다시 켠다. 저장 폴더(`.croche`, `/data`)는 지우지 않는다.
- 디버깅은 Croche Studio → Logs에서 턴별 모델 호출, 도구 호출, 비용을 본다.
- 문의·최신 정보: Croche Discord(디자인 파트너 채널). 서버리스 지원 여부, 새 SDK 마이그레이션 일정은 여기서 확인.

## 8. 참고 구현

손민수랩 덕메 레포(비공개) `HeejuChoii/dukme`
- `src/agent/croche.ts` — Croche를 여는 유일한 파일
- `src/agent/pool.ts` — 사용자별 인스턴스 관리(재사용, 직렬화, 유휴 정리, 상한)
- `src/identity.ts` — 서명된 익명 사용자 ID
- `src/agent/prompt.ts` — instructions / markerGuide / memory policy 예시
- `src/tools/*` — 도구 선언 + handler 예시
- `render.yaml` — Render 배포 설정
