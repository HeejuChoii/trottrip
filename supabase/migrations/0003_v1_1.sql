-- PRD v1.1: 준비 체크리스트(F19), 티켓 정보(F20), 일정 캐시(F5 일관성), API 사용량(9장 예산)
alter table trips add column if not exists checklist jsonb not null default '{}'::jsonb;
alter table trips add column if not exists ticket jsonb not null default '{}'::jsonb;

-- 같은 입력이면 같은 일정 (입력 해시 → 일정)
create table if not exists plan_cache (
  hash text primary key,
  plan jsonb not null,
  created_at timestamptz not null default now()
);

-- Claude API 호출 기록 (누적 비용 표시, 예산 상한)
create table if not exists api_usage (
  id uuid primary key,
  kind text not null,          -- plan | replan | chat | notice | checklist
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists api_usage_created_idx on api_usage (created_at);

alter table plan_cache enable row level security;
alter table api_usage enable row level security;
