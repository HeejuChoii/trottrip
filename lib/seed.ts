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
const kintex2 = { city: "고양", venue_name: "킨텍스 제2전시장 9A홀", venue_key: "kintex-2", venue_lat: 37.6655, venue_lng: 126.7496 };
const dcc2 = { city: "대전", venue_name: "대전컨벤션센터 제2전시장", venue_key: "dcc-2", venue_lat: 36.3748, venue_lng: 127.3935 };
const excoWest = { city: "대구", venue_name: "엑스코 서관 전시1홀", venue_key: "exco", venue_lat: 35.9066, venue_lng: 128.6115 };
const inspire = { city: "인천", venue_name: "인스파이어 아레나", venue_key: "inspire", venue_lat: 37.4648, venue_lng: 126.3891 };
const bexco1 = { city: "부산", venue_name: "벡스코 제1전시장", venue_key: "bexco", venue_lat: 35.1690, venue_lng: 129.1361 };

export const SEED_CONCERTS: Concert[] = [
  { ...base, ...coex, id: "psj-coex-1225", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-25", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...coex, id: "psj-coex-1226", title: "박서진 〈MY NAME IS SEOJIN:갓〉", artist_display: "박서진", color: "#C21F72", date: "2026-12-26", start_time: "17:00", est_end_time: "19:30", notice_text: PSJ_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1218", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-18", start_time: "19:30", est_end_time: "22:00", notice_text: LCW_NOTICE },
  { ...base, ...kintex, id: "lcw-kintex-1219", title: "이찬원 〈찬스 감사제〉", artist_display: "이찬원", color: "#5E46C9", date: "2026-12-19", start_time: "18:00", est_end_time: "20:30", notice_text: LCW_NOTICE },
  // ↓ 8명 가수 공연. 이승철·조용필·김건모·영탁은 공식 공지·예매처 기준 일정(시각이 없는 회차와 게이트·MD 시간은 시연용 가정),
  //   임영웅·송가인은 다가오는 공연이 없어 공연은 넣지 않고 팬덤 스팟 여행만 둔다
  { ...base, ...gwangjuWu, id: "lsc-gwangju-1114", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 광주", artist_display: "이승철", color: "#E07A1F", date: "2026-11-14", start_time: "16:00", est_end_time: "18:30",
    notice_text: "플로어석은 1층 정문, 스탠드석은 2층 입구로 들어오세요. 공식 MD는 체육관 앞에서 오후 1시부터 팔아요.",
    gate_map: { "플로어": "체육관 1층 정문", "스탠드": "체육관 2층 입구" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...dcc2, id: "lsc-daejeon-1122", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 대전", artist_display: "이승철", color: "#E07A1F", date: "2026-11-22", start_time: "16:00", est_end_time: "18:30",
    notice_text: "플로어 A·B구역은 1번 입구, C·D구역은 2번 입구로 들어오세요. 공식 MD는 제2전시장 로비에서 오후 2시부터 팔아요.", gate_map: { "A": "1번 입구", "B": "1번 입구", "C": "2번 입구", "D": "2번 입구" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...excoWest, id: "lsc-exco-1128", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 대구", artist_display: "이승철", color: "#E07A1F", date: "2026-11-28", start_time: "16:00", est_end_time: "18:30",
    notice_text: "서관 전시1홀 입구로 들어오세요. 공식 MD는 서관 로비에서 오후 2시부터 팔아요.", gate_map: { "A": "서관 1홀 1번 입구", "B": "서관 1홀 1번 입구", "C": "서관 1홀 2번 입구" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...kspo, id: "lsc-kspo-1204", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 서울", artist_display: "이승철", color: "#E07A1F", date: "2026-12-04", start_time: "19:30", est_end_time: "22:00",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 4시부터 팔아요.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...kspo, id: "lsc-kspo-1205", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 서울", artist_display: "이승철", color: "#E07A1F", date: "2026-12-05", start_time: "18:00", est_end_time: "20:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 3시부터 팔아요.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...kspo, id: "lsc-kspo-1206", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 서울", artist_display: "이승철", color: "#E07A1F", date: "2026-12-06", start_time: "17:00", est_end_time: "19:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 2시부터 팔아요.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...inspire, id: "lsc-inspire-1212", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 인천", artist_display: "이승철", color: "#E07A1F", date: "2026-12-12", start_time: "16:00", est_end_time: "18:30",
    notice_text: "인스파이어 아레나 1층 로비로 들어오세요. 공식 MD는 아레나 로비에서 오후 1시부터 팔아요.", gate_map: { "1층": "아레나 1층 입구", "2층": "아레나 2층 입구" }, ticket_url: "https://www.inspireresorts.com/ko/entertainment/performance/2026-lee-seung-chul-40th-concert-incheon" },
  { ...base, ...bexco1, id: "lsc-bexco-1224", title: "이승철 40주년 콘서트 〈THE VOICE〉 - 부산", artist_display: "이승철", color: "#E07A1F", date: "2026-12-24", start_time: "19:00", est_end_time: "21:30",
    notice_text: "제1전시장 홀 입구로 들어오세요. 공식 MD는 제1전시장 로비에서 오후 2시부터 팔아요.", gate_map: { "A": "제1전시장 1번 입구", "B": "제1전시장 1번 입구", "C": "제1전시장 2번 입구" }, ticket_url: "https://m.ticket.yes24.com/Perf/59533" },
  { ...base, ...kspo, id: "cyp-kspo-1127", title: "2026 조용필 & 위대한탄생 콘서트 - 서울", artist_display: "조용필", color: "#555B6E", date: "2026-11-27", start_time: "19:00", est_end_time: "21:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 3시부터 팔아요. 티켓 VIP 17.6만·R 16.5만·S 14.3만·A 11만 원.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Genre/GenreBridge.aspx?genre=15456&id=1576" },
  { ...base, ...kspo, id: "cyp-kspo-1128", title: "2026 조용필 & 위대한탄생 콘서트 - 서울", artist_display: "조용필", color: "#555B6E", date: "2026-11-28", start_time: "18:00", est_end_time: "20:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 2시부터 팔아요. 티켓 VIP 17.6만·R 16.5만·S 14.3만·A 11만 원.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Genre/GenreBridge.aspx?genre=15456&id=1576" },
  { ...base, ...kspo, id: "cyp-kspo-1129", title: "2026 조용필 & 위대한탄생 콘서트 - 서울", artist_display: "조용필", color: "#555B6E", date: "2026-11-29", start_time: "17:00", est_end_time: "19:30",
    notice_text: "1층은 1번 게이트, 2층은 3번 게이트로 들어오세요. 공식 MD는 공연장 앞 광장에서 오후 1시부터 팔아요. 티켓 VIP 17.6만·R 16.5만·S 14.3만·A 11만 원.", gate_map: { "1층": "1번 게이트 (엘리베이터 옆)", "2층": "3번 게이트" }, ticket_url: "https://m.ticket.yes24.com/Genre/GenreBridge.aspx?genre=15456&id=1576" },
  { ...base, ...excoWest, id: "cyp-exco-1219", title: "2026 조용필 & 위대한탄생 콘서트 - 대구", artist_display: "조용필", color: "#555B6E", date: "2026-12-19", start_time: "18:00", est_end_time: "20:30",
    notice_text: "엑스코 서관으로 들어오세요. 공식 MD는 서관 로비에서 오후 2시부터 팔아요. 예매처 YES24.", gate_map: { "A": "서관 1홀 1번 입구", "B": "서관 1홀 1번 입구", "C": "서관 1홀 2번 입구" }, ticket_url: "https://m.ticket.yes24.com/Genre/GenreBridge.aspx?genre=15456&id=1576" },
  { ...base, ...gwangjuWu, id: "kgm-gwangju-1205", title: "김건모 35TH ANNIVERSARY LIVE TOUR - 광주", artist_display: "김건모", color: "#6B5BD6", date: "2026-12-05", start_time: "17:00", est_end_time: "19:30",
    notice_text: "플로어석은 1층 정문, 스탠드석은 2층 입구로 들어오세요. 공식 MD는 체육관 앞에서 오후 2시부터 팔아요.", gate_map: { "플로어": "체육관 1층 정문", "스탠드": "체육관 2층 입구" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...kintex2, id: "kgm-kintex2-1226", title: "김건모 35TH ANNIVERSARY LIVE TOUR - 고양", artist_display: "김건모", color: "#6B5BD6", date: "2026-12-26", start_time: "17:00", est_end_time: "19:30",
    notice_text: "제2전시장 9A홀 입구로 들어오세요. 공식 MD는 9홀 로비에서 오후 2시부터 팔아요.", gate_map: { "A": "9A홀 1번 입구", "B": "9A홀 1번 입구", "C": "9A홀 2번 입구" }, ticket_url: "https://ticket.yes24.com/" },
  { ...base, ...exco, id: "yt-daegu-1128", title: "영탁 〈TAK SHOW 5 - 대구〉", artist_display: "영탁", color: "#2F7D6D", date: "2026-11-28", start_time: "18:00", est_end_time: "20:30",
    notice_text: "입장은 공연 1시간 전부터, 동관 1층 입구로 들어오세요. 공식 MD는 동관 로비에서 오후 3시부터 팔아요.", gate_map: { "R": "동관 1층 입구", "S": "동관 1층 입구" }, ticket_url: "https://ticket.melon.com/search/index.htm?q=%EC%98%81%ED%83%81" },
  { ...base, ...exco, id: "yt-daegu-1129", title: "영탁 〈TAK SHOW 5 - 대구〉", artist_display: "영탁", color: "#2F7D6D", date: "2026-11-29", start_time: "15:00", est_end_time: "17:30",
    notice_text: "입장은 공연 1시간 전부터, 동관 1층 입구로 들어오세요. 공식 MD는 동관 로비에서 낮 12시부터 팔아요.", gate_map: { "R": "동관 1층 입구", "S": "동관 1층 입구" }, ticket_url: "https://ticket.melon.com/search/index.htm?q=%EC%98%81%ED%83%81" },
  { ...base, ...bexco1, id: "yt-bexco-0116", title: "영탁 〈TAK SHOW 5 - 부산〉", artist_display: "영탁", color: "#2F7D6D", date: "2027-01-16", start_time: "15:00", est_end_time: "17:30",
    notice_text: "벡스코 제1전시장 3홀로 들어오세요. 일반예매는 11월 12일(목) 오후 8시에 열려요.", gate_map: { "R": "3홀 1번 입구", "S": "3홀 2번 입구" }, ticket_url: "https://weverse.io/youngtak/notice/38479" },
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
