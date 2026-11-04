-- 트롯트립이 직접 관리하는 장소 (카카오 로컬 식당·카페, 운영자 입력 시설·버스, 공연 공지, 웹 조사)
-- 콘서트립 장소(places_cache, 주로 팬덤 장소)와 합쳐서 일정에 쓴다.
alter table concerts add column if not exists venue_key text;
update concerts set venue_key = 'coex' where venue_key is null and venue_name like '코엑스%';
update concerts set venue_key = 'kintex-1' where venue_key is null and venue_name like '킨텍스 제1전시장%';

create table if not exists tt_places (
  id text primary key,
  venue_key text,                                   -- 같은 공연장 공연끼리 공유 (식당·시설·버스)
  concert_id text references concerts(id) on delete cascade, -- 그 공연만 (MD 부스·포토존·셔틀 공지)
  origin text not null check (origin in ('kakao','manual','notice','research')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  check (venue_key is not null or concert_id is not null)
);
create index if not exists tt_places_venue_idx on tt_places (venue_key);
create index if not exists tt_places_concert_idx on tt_places (concert_id);
alter table tt_places enable row level security;

-- 웹 조사로 확인한 교통 정보 (좌표는 /admin 장소 관리에서 "이름으로 좌표 찾기")
insert into tt_places (id, venue_key, origin, data) values
 ('rs_coex_east_gate_bus','coex','research','{"id":"rs_coex_east_gate_bus","concert_ids":[],"name":"코엑스 동문 앞 버스 하차","category":"bus_stop","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"코엑스 동문 앞 버스 하차 지점. 대형버스(대절버스)는 코엑스 주차장에 세울 수 없어 내려 주고 떠나요","evidence_urls":["https://www.coex.co.kr/guide/directions/","https://www.coex.co.kr/guide/parking-information/fee/"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}'),
 ('rs_coex_intercon_bus','coex','research','{"id":"rs_coex_intercon_bus","concert_ids":[],"name":"그랜드 인터컨티넨탈 호텔 앞 버스 하차 (삼성역 5번 출구)","category":"bus_stop","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"삼성역 5번 출구 쪽 호텔 앞 버스 하차 지점","evidence_urls":["https://www.coex.co.kr/guide/directions/"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}'),
 ('rs_coex_parking_desk','coex','research','{"id":"rs_coex_parking_desk","concert_ids":[],"name":"코엑스 주차고객 현장지원실 (02-6002-7130)","category":"info_desk","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"주차·차량 진입 문의. 대절버스 하차 위치는 공연 주최 측 공지를 우선 확인","evidence_urls":["https://www.coex.co.kr/guide/parking-information/fee/"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}'),
 ('rs_kintex_daehwa_shuttle','kintex-1','research','{"id":"rs_kintex_daehwa_shuttle","concert_ids":[],"name":"대화역 → 킨텍스 제1전시장 셔틀 승차","category":"bus_stop","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"3호선 대화역에서 제1전시장까지 무료 셔틀(평소 10분 간격). 콘서트 날은 따로 운영될 수 있어요","evidence_urls":["https://namu.wiki/w/KINTEX"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}'),
 ('rs_kintex_gtx_exit2','kintex-1','research','{"id":"rs_kintex_gtx_exit2","concert_ids":[],"name":"GTX-A 킨텍스역 2번 출구","category":"bus_stop","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"2번 출구로 나오면 제1전시장이 보여요","evidence_urls":["https://www.kintex.com/web/ko/html/company/contact.do"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}'),
 ('rs_kintex_info','kintex-1','research','{"id":"rs_kintex_info","concert_ids":[],"name":"킨텍스 대표전화 (031-995-8114)","category":"info_desk","lat":null,"lng":null,"address":"","walk_min_from_venue":null,"tags":[],"fan_type":"none","description_ko":"주차·셔틀·단체버스 문의","evidence_urls":["https://www.kintex.com/web/ko/html/company/contact.do"],"source":"needs_check","updated_at":"2026-11-02T00:00:00+09:00","concertrip_url":"","origin":"research"}')
on conflict (id) do nothing;
