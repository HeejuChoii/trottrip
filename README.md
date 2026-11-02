# 트롯트립 (TrotTrip)

자녀가 공연과 부모님 정보를 넣으면, AI가 콘서트 하루를 짜서 링크 하나로 부모님께 보내 드리는 모바일 웹앱 (PRD v1.0 MVP).

- Next.js 15 (App Router) + TypeScript + Tailwind 4
- Supabase(Postgres) — 미설정 시 로컬 개발용 `.data/db.json`
- Claude API(`@anthropic-ai/sdk`, 구조화 출력) — 미설정 시 규칙 기반 일정·답변
- 카카오 JS SDK(공유·지도) — 미설정 시 링크 복사·Web Share·장소 목록으로 대체
- 장소는 두 곳에서 와서 합쳐진다 (`lib/db.ts#getPlaces`)
  - 콘서트립: 팬덤 장소(가수 방문·팬 명소·공식). `lib/concertrip.ts` 어댑터 → `places_cache`
  - 트롯트립 직접(`tt_places`): 카카오 로컬 식당·카페, 운영자 입력 시설·버스 승하차, 공연 공지 AI 정리(MD 부스·포토존·게이트·셔틀), 웹 조사. `/admin` → 공연 행의 "장소 관리"
  - 공연장 공통 장소는 `venue_key`(예: coex, kintex-1)로 같은 공연장 공연끼리 공유, 공지 장소는 그 공연에만

## 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (비워 두면 로컬 모드)
npm run dev                  # http://localhost:3000
npm test                     # 일정 엔진·어댑터 테스트
```

데모·리허설용 시각 덮어쓰기: 부모님 링크에 `?date=2026-12-25&now=14:10`을 붙이면 그 시각 기준으로 "지금 할 일"·귀가 안내가 바뀝니다(세션 동안 유지).

예시 장소: `/admin` → 코엑스 공연 행의 "JSON 업로드"에 `data/sample-places-coex.json`(이름에 "(예시)"가 붙은 가짜 데이터)을 올리면 장소가 있는 경로를 확인할 수 있습니다.

## 화면 / 경로

| 화면 | 경로 |
|---|---|
| K0 시작·얼리버드 | `/` (`?src=` 첫 방문 저장) |
| K1~K4 공연·부모님·취향·AI 설계 중 | `/new` |
| K5 완성된 일정·편집·공유·결제 의향 | `/k/{kid_token}` |
| K6 진행 상황 | `/k/{kid_token}/status` |
| P1 지금 할 일 / P4 귀가 안내(공연 종료 후 자동) | `/p/{parent_token}` |
| P2 공연장 · P3 일정 바꾸기 · P5 지도 · P6 물어보기 | `/p/{token}/venue` `/change` `/map` `/ask` |
| A1 운영자 | `/admin` |
| OG·카카오 공유 이미지 | `/api/og?t={parent_token}` |

## 환경변수

| 이름 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | 일정 생성·재생성·챗봇. 없으면 규칙 기반 |
| `ANTHROPIC_MODEL` | 선택. 기본 `claude-opus-5-5` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | DB. **Vercel 배포 시 필수**(파일 저장소는 서버리스에서 유지되지 않음) |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 카카오 공유·지도. 카카오 디벨로퍼스에 배포 도메인 등록 |
| `CONCERTRIP_API_URL`, `CONCERTRIP_API_TOKEN` | 콘서트립 공개 읽기 API (`GET {URL}/concerts/{id}/places`) |
| `ADMIN_PASSWORD` | `/admin` 비밀번호 |
| `KAKAO_REST_API_KEY` | 카카오 로컬 API(주변 식당·카페 불러오기, 좌표 찾기). 카카오 디벨로퍼스 같은 앱의 REST API 키 |
| `NEXT_PUBLIC_SITE_URL` | 배포 주소 (OG·공유 링크 절대경로) |
| `AGENT_URL` | Render 챗봇 서버 주소 (예: `https://trottrip-agent.onrender.com`). 비우면 챗봇은 Claude → 규칙 기반 |
| `AGENT_SHARED_SECRET` | Render와 같은 비밀값. Vercel이 요청에 서명하고 Render가 검증 |

## Supabase

`supabase/migrations/0001_init.sql` → `0002_tt_places.sql` → `supabase/seed.sql` 순서로(이미 0001·seed를 실행했다면 0002만) SQL 에디터에서 실행. RLS를 켜고 정책을 두지 않아 anon 키로는 접근할 수 없고, 서버만 service role 키로 접근합니다.

## 일정 생성 (F5)

`lib/ai.ts` → Claude 구조화 출력(zod 스키마) → `lib/planner.ts#validatePlan`(스키마·시각·place_id 존재 확인) → 실패 시 1회 재시도 → 그래도 실패하면 규칙 기반 `buildRulePlan`. 장소가 없는 공연(직접 입력·장소 미등록)은 "일반 일정"으로 만듭니다. 거절(refusal) 대비로 서버 측 `fallbacks: "default"`를 켰습니다.

## 물어보기 챗봇 (Croche, `agent/`)

자세한 규칙은 `CROCHE.md`. Croche 웹 SDK는 서버리스를 지원하지 않아서 챗봇만 Render에서 돈다.

```
부모님 화면 → Vercel /api/p/{token}/chat ──(HMAC 서명, 서버-서버)──> Render agent/ (Croche)
               ├ 응급 키워드는 Vercel에서 먼저 처리(119 안내)
               ├ 대화 기록은 Vercel이 Supabase chats에 저장(자녀 진행 화면)
               └ Render가 실패하면 규칙 기반 답변으로 대신
```

- 사용자 ID = 안내장(trip) ID. 저장 경로 `/data/users/<trip_id>/`
- 도구 `venue find|schedule|gate`: 장소는 매 턴 context에 넣지 않고 도구로 가까운 1~2곳만 찾는다(토큰 절약, 목록에 없으면 빈 결과)
- 근거가 없으면 마커 `:unknown:` → Vercel이 "확인이 필요해요. ○○ 안내소에 물어보세요 + 자녀 번호"로 바꾼다
- 상한: 안내장당 하루 60회, 서버 전체 시간당 800회, 한 턴 도구 반복 5회, 동시 인스턴스 100개(15분 미사용 시 닫음)

```bash
cd agent && npm install
cp .env.example .env   # CROCHE_PROJECT_KEY, CROCHE_DEBUG_KEY(cdt_…), AGENT_SHARED_SECRET
npm run dev            # http://localhost:8787  (Vercel 쪽 AGENT_URL=http://localhost:8787)
npm test               # 가짜 Croche로 서명·직렬화·상한·도구 테스트
```

Render: New → Blueprint → 이 레포 선택(`render.yaml`) → `CROCHE_PROJECT_KEY`, `CROCHE_SERVER_KEY`(csk_…), `AGENT_SHARED_SECRET` 입력.
