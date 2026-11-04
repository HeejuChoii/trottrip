-- 공지 자동 확인 결과(제안). 운영자가 /admin에서 적용해야 부모님 화면에 반영된다
create table if not exists notice_checks (
  id uuid primary key,
  concert_id text not null references concerts(id) on delete cascade,
  result jsonb not null,           -- { text, sources, extract }
  status text not null default 'new' check (status in ('new','applied','dismissed','failed')),
  created_at timestamptz not null default now()
);
create index if not exists notice_checks_concert_idx on notice_checks (concert_id, created_at desc);
alter table notice_checks enable row level security;
