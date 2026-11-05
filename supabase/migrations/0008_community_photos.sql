-- 팬 라운지: 사진(최대 4장)·숨김·신고
alter table community_posts add column if not exists images jsonb not null default '[]'::jsonb;
alter table community_posts add column if not exists hidden boolean not null default false;
alter table community_posts add column if not exists reports int not null default 0;

create table if not exists community_reports (
  post_id text not null,
  reporter_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);
alter table community_reports enable row level security;

-- 사진 보관함(공개 읽기). 업로드는 서버(service 키)만 한다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
