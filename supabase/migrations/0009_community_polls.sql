-- 팬 라운지: 글쓴이가 만드는 투표, 댓글 사진(스밍 인증 캡처 등)
alter table community_posts add column if not exists poll jsonb;
alter table community_comments add column if not exists images jsonb not null default '[]'::jsonb;
