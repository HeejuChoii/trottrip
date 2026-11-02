# 트롯트립 (TrotTrip)

자녀가 공연과 부모님 정보를 넣으면, AI가 콘서트 하루를 짜서 링크 하나로 부모님께 보내 드리는 모바일 웹앱 (PRD v1.0 MVP).

- Next.js 15 (App Router) + TypeScript + Tailwind 4
- Supabase(Postgres) — 미설정 시 로컬 개발용 `.data/db.json`
- Claude API(`@anthropic-ai/sdk`, 구조화 출력) — 미설정 시 규칙 기반 일정·답변
- 카카오 JS SDK(공유·지도) — 미설정 시 링크 복사·Web Share·장소 목록으로 대체
- 장소 원본은 콘서트립. `lib/concertrip.ts` 어댑터가 PRD 5.3 형태로 바꿔 `places_cache`에 캐시

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
| `NEXT_PUBLIC_SITE_URL` | 배포 주소 (OG·공유 링크 절대경로) |

## Supabase

`supabase/migrations/0001_init.sql` → `supabase/seed.sql` 순서로 SQL 에디터에서 실행. RLS를 켜고 정책을 두지 않아 anon 키로는 접근할 수 없고, 서버만 service role 키로 접근합니다.

## 일정 생성 (F5)

`lib/ai.ts` → Claude 구조화 출력(zod 스키마) → `lib/planner.ts#validatePlan`(스키마·시각·place_id 존재 확인) → 실패 시 1회 재시도 → 그래도 실패하면 규칙 기반 `buildRulePlan`. 장소가 없는 공연(직접 입력·장소 미등록)은 "일반 일정"으로 만듭니다. 거절(refusal) 대비로 서버 측 `fallbacks: "default"`를 켰습니다.
