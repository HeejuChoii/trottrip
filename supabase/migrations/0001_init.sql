-- 트롯트립 DB (PRD 8장). 인증 없음: 모든 접근은 서버(service role)에서만 한다.
create table if not exists concerts (
  id text primary key,
  concertrip_id text,
  title text not null,
  artist_display text not null default '',
  color text not null default '#087E72',
  city text not null default '',
  venue_name text not null,
  venue_lat double precision,
  venue_lng double precision,
  date date not null,
  start_time text not null,
  est_end_time text,
  notice_text text not null default '',
  gate_map jsonb not null default '{}'::jsonb,
  zone_image_url text,
  official_map_url text,
  info_desk_place_id text,
  active boolean not null default true
);

-- 콘서트립 장소 캐시 (원본은 콘서트립)
create table if not exists places_cache (
  id text not null,
  concert_id text not null references concerts(id) on delete cascade,
  data jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (concert_id, id)
);

create table if not exists trips (
  id uuid primary key,
  concert_id text references concerts(id),
  custom_concert jsonb,
  parent_profile jsonb not null,
  prefs jsonb not null,
  transport jsonb not null,
  seat text not null default '',
  plan jsonb,
  plan_version int not null default 1,
  parent_token text not null unique,
  kid_token text not null unique,
  kid_label text not null default '딸',
  kid_name text not null default '',
  kid_phone text not null default '',
  src text not null default '',
  marketing_opt_in boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists trip_events (
  id uuid primary key,
  trip_id uuid references trips(id) on delete cascade, -- 'start' 이벤트는 trip 없이 기록
  type text not null check (type in ('start','parent_open','done','change','chat','boarded','share_kakao','share_email','share_copy','intent')),
  item_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trip_events_trip_idx on trip_events (trip_id, created_at);

create table if not exists chats (
  id uuid primary key,
  trip_id uuid not null references trips(id) on delete cascade,
  role text not null check (role in ('parent','ai')),
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists chats_trip_idx on chats (trip_id, created_at);

-- anon 키로는 아무것도 읽거나 쓰지 못하게 RLS만 켜 둔다(정책 없음 = 거부). 서버는 service role 키 사용.
alter table concerts enable row level security;
alter table places_cache enable row level security;
alter table trips enable row level security;
alter table trip_events enable row level security;
alter table chats enable row level security;
