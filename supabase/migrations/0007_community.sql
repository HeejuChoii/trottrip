-- 팬 라운지(가수별 커뮤니티): 글·댓글·좋아요. 카카오 로그인 사용자(author_id = "kakao:{id}")
create table if not exists community_posts (
  id uuid primary key,
  artist text not null,
  category text not null,
  title text not null default '',
  body text not null,
  author_id text not null,
  author_name text not null,
  likes int not null default 0,
  comments int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_artist_idx on community_posts (artist, created_at desc);
create index if not exists community_posts_created_idx on community_posts (created_at desc);

create table if not exists community_comments (
  id uuid primary key,
  post_id text not null,
  author_id text not null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on community_comments (post_id, created_at);

create table if not exists community_likes (
  post_id text not null,
  author_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, author_id)
);

alter table community_posts enable row level security;
alter table community_comments enable row level security;
alter table community_likes enable row level security;
