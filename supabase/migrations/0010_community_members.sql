-- 팬 라운지 가입자(카카오 로그인·닉네임 체험): 운영자 화면에서 보기. 닉네임만 저장(이메일·전화번호 없음)
create table if not exists community_members (
  id text primary key,            -- "kakao:{카카오 회원번호}" 또는 "guest:{임의값}"
  name text not null,
  provider text not null,         -- kakao | guest
  logins int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists community_members_first_idx on community_members (first_at desc);
alter table community_members enable row level security;
