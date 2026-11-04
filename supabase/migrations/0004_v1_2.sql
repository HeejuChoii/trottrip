-- PRD v1.2: 이벤트 종류 추가 (자녀 걱정 1문항, 부모님 만족도, 덜 걷게 바꾸기, 평가 세트 결과)
alter table trip_events drop constraint if exists trip_events_type_check;
alter table trip_events add constraint trip_events_type_check check (type in (
  'start','parent_open','done','change','chat','boarded','share_kakao','share_email','share_copy','intent',
  'survey','feedback','less_walk','eval'
));
