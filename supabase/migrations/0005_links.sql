-- 공연별 예매처·셔틀 예약 링크 (링크 안내까지만, 판매·알선은 하지 않음)
alter table concerts add column if not exists ticket_url text;
alter table concerts add column if not exists shuttle_url text;
