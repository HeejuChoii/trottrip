// 1차 등록 공연 시드 (PRD 15장). 날짜·시각은 공식 공지로 재확인 필요.
// concertrip_id는 콘서트립 공연 ID 확인 후 /admin에서 입력한다.
import type { Concert } from "./types.ts";

const base = {
  concertrip_id: null,
  zone_image_url: null,
  official_map_url: null,
  info_desk_place_id: null,
  gate_map: {},
  active: true,
};

const PSJ_NOTICE = "입장 구역·게이트·MD 부스 운영 시간은 공식 공지가 나오면 업데이트돼요.";
const LCW_NOTICE = "공연 시작 시각은 예매처(예스24) 공지로 확인 중이에요. 입장 게이트·MD 부스 시간은 공지가 나오면 업데이트돼요.";

const coex = { city: "서울", venue_name: "코엑스 D홀", venue_lat: 37.5126, venue_lng: 127.0588 };
const kintex = { city: "고양", venue_name: "킨텍스 제1전시장 5홀", venue_lat: 37.6688, venue_lng: 126.7451 };

export const SEED_CONCERTS: Concert[] = [
  { ...base, ...coex, id: "psj-coex-1225", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-25", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...coex, id: "psj-coex-1226", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-26", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1218", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-18", start_time: "19:30", est_end_time: "22:00", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1219", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-19", start_time: "18:00", est_end_time: "20:30", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1220", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-20", start_time: "15:00", est_end_time: "17:30", notice_text: LCW_NOTICE },
];
