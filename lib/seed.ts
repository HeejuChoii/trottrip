// 1차 등록 공연 시드 (PRD 15장). 날짜·시각은 공식 공지로 재확인 필요.
// concertrip_id는 콘서트립 공연 ID 확인 후 /admin에서 입력한다.
import type { Concert, Place, TtPlaceRow } from "./types.ts";

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

const coex = { city: "서울", venue_name: "코엑스 D홀", venue_key: "coex", venue_lat: 37.5126, venue_lng: 127.0588 };
const kintex = { city: "고양", venue_name: "킨텍스 제1전시장 5홀", venue_key: "kintex-1", venue_lat: 37.6688, venue_lng: 126.7451 };

export const SEED_CONCERTS: Concert[] = [
  { ...base, ...coex, id: "psj-coex-1225", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-25", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...coex, id: "psj-coex-1226", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-26", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1218", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-18", start_time: "19:30", est_end_time: "22:00", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1219", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-19", start_time: "18:00", est_end_time: "20:30", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1220", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-20", start_time: "15:00", est_end_time: "17:30", notice_text: LCW_NOTICE },
];

// 웹 조사로 확인한 공연장 교통 정보 (2026-11-02). 좌표는 /admin에서 "카카오로 좌표 찾기"로 채운다.
// 공연별 셔틀(퀸즈스마일·버스타다·카카오T)과 대절버스 하차 지점은 공연마다 달라서 공지가 나오면 /admin 공지 붙여넣기로 넣는다.

function research(id: string, venue_key: string, p: Partial<Place> & Pick<Place, "name" | "category" | "description_ko">, evidence: string[]): TtPlaceRow {
  const data: Place = {
    id, concert_ids: [], lat: null, lng: null, address: "", walk_min_from_venue: null, tags: [], fan_type: "none",
    evidence_urls: evidence, source: "needs_check", updated_at: "2026-11-02T00:00:00+09:00", concertrip_url: "", origin: "research",
    ...p,
  };
  return { id, venue_key, concert_id: null, origin: "research", data, updated_at: data.updated_at };
}

const COEX_DIR = "https://www.coex.co.kr/guide/directions/";
const COEX_FEE = "https://www.coex.co.kr/guide/parking-information/fee/";
const KINTEX_DIR = "https://www.kintex.com/web/ko/html/company/contact.do";

export const SEED_TT_PLACES: TtPlaceRow[] = [
  research("rs_coex_east_gate_bus", "coex", { name: "코엑스 동문 앞 버스 하차", category: "bus_stop",
    description_ko: "코엑스 동문 앞 버스 하차 지점. 대형버스(대절버스)는 코엑스 주차장에 세울 수 없어 내려 주고 떠나요" }, [COEX_DIR, COEX_FEE]),
  research("rs_coex_intercon_bus", "coex", { name: "그랜드 인터컨티넨탈 호텔 앞 버스 하차 (삼성역 5번 출구)", category: "bus_stop",
    description_ko: "삼성역 5번 출구 쪽 호텔 앞 버스 하차 지점" }, [COEX_DIR]),
  research("rs_coex_parking_desk", "coex", { name: "코엑스 주차고객 현장지원실 (02-6002-7130)", category: "info_desk",
    description_ko: "주차·차량 진입 문의. 대절버스 하차 위치는 공연 주최 측 공지를 우선 확인" }, [COEX_FEE]),
  research("rs_kintex_daehwa_shuttle", "kintex-1", { name: "대화역 → 킨텍스 제1전시장 셔틀 승차", category: "bus_stop",
    description_ko: "3호선 대화역에서 제1전시장까지 무료 셔틀(평소 10분 간격). 콘서트 날은 따로 운영될 수 있어요" }, ["https://namu.wiki/w/KINTEX"]),
  research("rs_kintex_gtx_exit2", "kintex-1", { name: "GTX-A 킨텍스역 2번 출구", category: "bus_stop",
    description_ko: "2번 출구로 나오면 제1전시장이 보여요" }, [KINTEX_DIR]),
  research("rs_kintex_info", "kintex-1", { name: "킨텍스 대표전화 (031-995-8114)", category: "info_desk",
    description_ko: "주차·셔틀·단체버스 문의" }, [KINTEX_DIR]),
];
