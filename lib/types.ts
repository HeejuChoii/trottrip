// 트롯트립 공통 타입 (PRD 5.3, 6장, 8장)

export const PLACE_CATEGORIES = [
  "restaurant", "cafe", "rest", "goods", "photo", "toilet", "elevator",
  "gate", "info_desk", "locker", "bus_stop", "sight",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const FAN_TYPES = ["artist_visited", "fan_made", "official", "none"] as const;
export type FanType = (typeof FAN_TYPES)[number];

export const PLACE_TAGS = ["korean", "chinese", "japanese", "western", "snack", "asian", "mild", "seafood", "quick", "indoor", "elevator", "seating", "accessible"] as const;
/** 식사 종류 태그 (카카오 분류에서 코드로 붙인다) */
export const CUISINE_TAGS = ["korean", "chinese", "japanese", "western", "snack", "asian"] as const;
export type PlaceTag = (typeof PLACE_TAGS)[number];

export type PlaceSource = "verified" | "needs_check" | "user_input";

/** 콘서트립 어댑터 출력 형태 (PRD 5.3) */
export interface Place {
  id: string;
  concert_ids: string[];
  name: string;
  category: PlaceCategory;
  lat: number | null;
  lng: number | null;
  address: string;
  walk_min_from_venue: number | null;
  tags: PlaceTag[];
  fan_type: FanType;
  description_ko: string;
  evidence_urls: string[];
  source: PlaceSource;
  updated_at: string;
  concertrip_url: string;
  /** 어디서 왔나. 없으면 concertrip */
  origin?: PlaceOrigin;
  /** 카카오 분류 원문 (예: "음식점 > 한식 > 국밥") */
  category_detail?: string;
  phone?: string;
  /** 카카오맵 등 외부 상세 링크 */
  link_url?: string;
  /** AI가 이름·분류로 추정한 맵기 (메뉴 원문은 받지 않음). mild=덜 매운 메뉴가 많음, spicy=대표 메뉴가 매움 */
  ai_spice?: "mild" | "medium" | "spicy" | "unknown";
  /** AI 추정 근거 한 줄 (예: "국밥·설렁탕류라 맵지 않은 메뉴가 많아요") */
  ai_note?: string;
  /** AI 추정: 대표 메뉴가 국물 요리인지 */
  ai_soup?: boolean | null;
  /** AI 추정: 주식 (밥/면/빵/섞임) */
  ai_staple?: "rice" | "noodle" | "bread" | "mixed" | "unknown";
  /** AI 추정: 회·초밥처럼 날것이 대표 메뉴인지 */
  ai_raw?: boolean | null;
}

/** 장소 출처: 콘서트립(팬덤 장소), 카카오 로컬(식당·카페), 운영자 입력, 공연 공지에서 추출, 웹 조사 */
export const PLACE_ORIGINS = ["concertrip", "kakao", "manual", "notice", "research"] as const;
export type PlaceOrigin = (typeof PLACE_ORIGINS)[number];

/** 트롯트립이 직접 관리하는 장소. venue_key(공연장 공통) 또는 concert_id(그 공연만) 범위 */
export interface TtPlaceRow {
  id: string;
  venue_key: string | null;
  concert_id: string | null;
  origin: Exclude<PlaceOrigin, "concertrip">;
  data: Place;
  updated_at: string;
}

export interface Concert {
  id: string;
  concertrip_id: string | null;
  title: string;
  artist_display: string;
  color: string;
  city: string;
  venue_name: string;
  /** 같은 공연장 공연끼리 시설·식당·버스 장소를 같이 쓰는 키 (예: coex, kintex-1) */
  venue_key: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  date: string; // YYYY-MM-DD (KST)
  start_time: string; // HH:MM
  est_end_time: string | null; // HH:MM
  notice_text: string;
  gate_map: Record<string, string>; // "B" -> "3번 입구"
  zone_image_url: string | null;
  official_map_url: string | null;
  info_desk_place_id: string | null;
  active: boolean;
  /** 예매처 공연 상세 링크 (티켓이 아직 없는 자녀, 공지 확인용) */
  ticket_url?: string | null;
  /** 공식·제휴 셔틀 예약 링크 (카카오 T 셔틀, 퀸즈스마일, 버스타다 등). 링크 안내까지만 하고 판매·알선은 하지 않는다 */
  shuttle_url?: string | null;
}

/** 목록에 없는 공연 직접 입력 (F2) */
export interface CustomConcert {
  title: string;
  venue_name: string;
  date: string;
  start_time: string;
}

export type WalkLevel = "30+" | "15-30" | "15-";

/** 부모님 여행 스타일 (v1.1: 아픈 사람처럼 묻지 않는다) */
export interface ParentProfile {
  honorific: string; // 어머니/아버지/두 분/직접
  age_band: "40s" | "50s" | "60s" | "70+";
  /** 걷기 스타일: 30+ 많이 걸어도 좋아요 / 15-30 적당히 / 15- 여유롭게(택시·쉬는 시간 넉넉히) */
  walk: WalkLevel;
  /** 평소 하루 걸음 수(선택). 0 = 모름 */
  steps_usual: number;
  food: string[]; // korean/chinese/japanese/western/snack(종류), mild(덜 매운), seafood, quick, any
  food_other: string;
  // ↓ 더 챙겨 드릴 것(선택)
  elevator_first: boolean;
  medicine_time: string; // HH:MM or ""
  rest_often: boolean;
  near_toilet: boolean;
  friends_fitness: "same" | "better";
}

export interface Prefs {
  goods: boolean;
  photo: boolean;
  artist_places: boolean;
  /** 가수가 다녀간 곳을 1순위로 (굿즈·포토존보다 먼저, 걷기 기준을 넘으면 택시) */
  fan_first: boolean;
  sightseeing: boolean;
}

export type TransportMode = "fan_bus" | "train" | "shuttle" | "car";

export interface Transport {
  mode: TransportMode;
  origin: string;
  companions: "alone" | "friends" | "fan_bus" | "family";
  friends_count: number;
  // 팬 모임 버스
  meet_place: string;
  meet_time: string;
  drop_point: string;
  return_time: string;
  return_place: string;
  // 열차
  train_from: string;
  train_to: string;
  train_depart: string;
  train_arrive: string;
  train_return_depart: string;
  // 셔틀
  shuttle_info: string;
  // 숙박
  stay: "day" | "overnight";
}

export const ITEM_TYPES = ["arrive", "meal", "goods", "photo", "rest", "enter", "show", "return", "medicine", "extra"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface PlanItem {
  id: string;
  start: string;
  end: string;
  type: ItemType;
  title: string;
  place_id: string | null;
  walk_min: number | null;
  parent_text: string;
  done_label: string;
  kid_note: string;
  source: PlaceSource | "needs_check";
  optional?: boolean;
  /** "왜 여기?" 한 줄. 장소 태그·거리·조건에서 코드가 만든다(AI가 쓰지 않음) */
  why?: string;
}

/** 일정이 만들어진 단계 기록 (자녀 화면 "AI가 이렇게 짰어요", 발표 시연용) */
export interface TraceStep { step: string; detail: string }

export interface Plan {
  title: string;
  summary: string;
  items: PlanItem[];
  extra_day: { title: string; place_ids: string[] } | null;
  general?: boolean; // 장소 없이 만든 "일반 일정"
  generated_by?: "ai" | "rules";
  /** 규칙 기반으로 만든 이유 (AI 실패·예산 소진 등). 자녀 화면에 짧게 보여 준다 */
  fallback_reason?: string;
  /** 덜 걷게 바꾼 일정 */
  less_walk?: boolean;
  trace?: TraceStep[];
}

export interface Trip {
  id: string;
  concert_id: string | null;
  custom_concert: CustomConcert | null;
  parent_profile: ParentProfile;
  prefs: Prefs;
  transport: Transport;
  seat: string;
  plan: Plan | null;
  plan_version: number;
  parent_token: string;
  kid_token: string;
  kid_label: string;
  kid_name: string;
  kid_phone: string;
  src: string;
  marketing_opt_in: boolean;
  expires_at: string;
  created_at: string;
  /** F19 자녀 준비 체크리스트: 항목 id → 체크 여부 */
  checklist: Record<string, boolean>;
  /** F20 티켓·예약 정보 */
  ticket: TicketInfo;
}

export interface TicketInfo {
  vendor: string; // 예매처 (티켓링크, 예스24 등)
  pickup: "" | "mobile" | "onsite" | "paper"; // 모바일 티켓 / 현장 수령 / 종이 티켓
  booker_name: string; // 예매자 이름(본인 확인용, 선택)
  id_check: boolean; // 신분증 확인 필요
  bus_car: string; // 귀가 버스 호차
  bus_seat: string;
  note: string;
}

export const EVENT_TYPES = [
  "start", "parent_open", "done", "change", "chat", "boarded",
  "share_kakao", "share_email", "share_copy", "intent",
  // v1.2: 수요 근거(자녀 걱정 1문항, 부모님 만족도), 덜 걷게 바꾸기, 평가 세트 결과
  "survey", "feedback", "less_walk", "eval",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface TripEvent {
  id: string;
  trip_id: string | null;
  type: EventType;
  item_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ChatRow {
  id: string;
  trip_id: string;
  role: "parent" | "ai";
  text: string;
  created_at: string;
}

/** 일정 생성·챗봇에 쓰는 공연 정보 (등록 공연 또는 직접 입력) */
export interface ConcertView {
  id: string | null;
  title: string;
  artist_display: string;
  color: string;
  city: string;
  venue_name: string;
  venue_lat: number | null;
  venue_lng: number | null;
  date: string;
  start_time: string;
  est_end_time: string | null;
  notice_text: string;
  gate_map: Record<string, string>;
  zone_image_url: string | null;
  official_map_url: string | null;
  info_desk_place_id: string | null;
  custom: boolean;
  ticket_url?: string | null;
  shuttle_url?: string | null;
}
