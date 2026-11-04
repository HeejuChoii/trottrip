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
const kspo = { city: "서울", venue_name: "KSPO DOME", venue_key: "kspo", venue_lat: 37.5193, venue_lng: 127.1272 };
const gocheok = { city: "서울", venue_name: "고척스카이돔", venue_key: "gocheok", venue_lat: 37.4982, venue_lng: 126.8670 };
const bexco = { city: "부산", venue_name: "벡스코 오디토리움", venue_key: "bexco", venue_lat: 35.1690, venue_lng: 129.1361 };
const exco = { city: "대구", venue_name: "엑스코 동관", venue_key: "exco", venue_lat: 35.9070, venue_lng: 128.6131 };
const gwangjuWu = { city: "광주", venue_name: "광주여대 유니버시아드체육관", venue_key: "gwangju-wu", venue_lat: 35.1375, venue_lng: 126.7915 };
const goyangGym = { city: "고양", venue_name: "고양체육관", venue_key: "goyang-gym", venue_lat: 37.6757, venue_lng: 126.7427 };

export const SEED_CONCERTS: Concert[] = [
  { ...base, ...coex, id: "psj-coex-1225", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-25", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...coex, id: "psj-coex-1226", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-26", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1218", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-18", start_time: "19:30", est_end_time: "22:00", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1219", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-19", start_time: "18:00", est_end_time: "20:30", notice_text: LCW_NOTICE },
  // ↓ 시연용: 8명 가수 공연. 이승철 광주(11/14)·조용필 KSPO(11/27~29)는 보도로 확인한 일정, 나머지는 시연용 가상 공연(날짜·시각 재확인 필요)
  { ...base, ...gocheok, id: "lyw-gocheok-1227", title: "임영웅 〈IM HERO 2026 앙코르〉", artist_display: "임영웅", color: "#3A8DDE", date: "2026-12-27", start_time: "18:00", est_end_time: "21:00",
    notice_text: "입장은 공연 1시간 전부터예요. A·B구역은 1루 게이트, C·D구역은 3루 게이트로 들어오세요. 공식 MD는 외야 광장에서 오후 2시부터 팔아요.",
    gate_map: { A: "1루 게이트", B: "1루 게이트", C: "3루 게이트", D: "3루 게이트" }, ticket_url: "https://nol.yanolja.com/ticket/search?keyword=%EC%9E%84%EC%98%81%EC%9B%85" },
  { ...base, ...bexco, id: "sgi-bexco-1213", title: "송가인 〈가인달 2026 전국투어 - 부산〉", artist_display: "송가인", color: "#E2557B", date: "2026-12-13", start_time: "15:00", est_end_time: "17:30",
    notice_text: "1층은 1층 입구, 2층은 2층 입구로 들어오세요. 공식 MD는 오디토리움 로비에서 공연 2시간 전부터 팔아요.",
    gate_map: { "1층": "오디토리움 1층 입구", "2층": "오디토리움 2층 입구" }, ticket_url: "https://nol.yanolja.com/ticket/search?keyword=%EC%86%A1%EA%B0%80%EC%9D%B8" },
  { ...base, ...exco, id: "yt-exco-1206", title: "영탁 〈TAK SHOW 5 - 대구〉", artist_display: "영탁", color: "#2F7D6D", date: "2026-12-06", start_time: "18:00", est_end_time: "20:30",
    notice_text: "입장은 공연 1시간 전부터, 동관 1층 입구로 들어오세요. 공식 MD는 동관 로비에서 오후 3시부터 팔아요.",
    gate_map: { R: "동관 1층 입구", S: "동관 1층 입구" }, ticket_url: "https://nol.yanolja.com/ticket/search?keyword=%EC%98%81%ED%83%81" },
  { ...base, ...gwangjuWu, id: "lsc-gwangju-1114", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 광주", artist_display: "이승철", color: "#E07A1F", date: "2026-11-14", start_time: "16:00", est_end_time: "18:30",
    notice_text: "플로어석은 1층 정문, 스탠드석은 2층 입구로 들어오세요. 공식 MD는 체육관 앞에서 오후 1시부터 팔아요.",
    gate_map: { "플로어": "체육관 1층 정문", "스탠드": "체육관 2층 입구" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...kspo, id: "lsc-kspo-1205", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 서울", artist_display: "이승철", color: "#E07A1F", date: "2026-12-05", start_time: "18:00", est_end_time: "20:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 3시부터 팔아요.",
    gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...goyangGym, id: "kgm-goyang-1121", title: "김건모 35TH ANNIVERSARY LIVE TOUR - 고양", artist_display: "김건모", color: "#6B5BD6", date: "2026-11-21", start_time: "18:00", est_end_time: "20:30",
    notice_text: "입장은 공연 1시간 전부터, 체육관 1층 입구로 들어오세요. 공식 MD는 체육관 앞 광장에서 오후 3시부터 팔아요.",
    gate_map: { A: "체육관 1층 입구 (엘리베이터 옆)", B: "체육관 1층 입구 (엘리베이터 옆)" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...kspo, id: "cyp-kspo-1127", title: "2026 조용필 & 위대한탄생 콘서트 - 서울", artist_display: "조용필", color: "#555B6E", date: "2026-11-27", start_time: "20:00", est_end_time: "22:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 4시부터 팔아요.",
    gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...kspo, id: "cyp-kspo-1128", title: "2026 조용필 & 위대한탄생 콘서트 - 서울", artist_display: "조용필", color: "#555B6E", date: "2026-11-28", start_time: "18:00", est_end_time: "20:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 2시부터 팔아요.",
    gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://ticket.yes24.com/" },
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
