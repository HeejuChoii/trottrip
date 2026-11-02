// 트롯트립 공통 타입 (PRD 5.3, 6장, 8장)

export const PLACE_CATEGORIES = [
  "restaurant", "cafe", "rest", "goods", "photo", "toilet", "elevator",
  "gate", "info_desk", "locker", "bus_stop", "sight",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const FAN_TYPES = ["artist_visited", "fan_made", "official", "none"] as const;
export type FanType = (typeof FAN_TYPES)[number];

export const PLACE_TAGS = ["korean", "mild", "seafood", "quick", "indoor", "elevator", "seating", "accessible"] as const;
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
}

export interface Concert {
  id: string;
  concertrip_id: string | null;
  title: string;
  artist_display: string;
  color: string;
  city: string;
  venue_name: string;
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
}

/** 목록에 없는 공연 직접 입력 (F2) */
export interface CustomConcert {
  title: string;
  venue_name: string;
  date: string;
  start_time: string;
}

export type WalkLevel = "30+" | "15-30" | "15-";

export interface ParentProfile {
  honorific: string; // 어머니/아버지/두 분/직접
  age_band: "50s" | "60s" | "70+";
  walk: WalkLevel;
  rest_often: boolean;
  elevator_first: boolean;
  food: string[]; // korean, mild, seafood, quick
  food_other: string;
  medicine_time: string; // HH:MM or ""
  friends_fitness: "same" | "better";
}

export interface Prefs {
  goods: boolean;
  photo: boolean;
  artist_places: boolean;
  sightseeing: boolean;
}

export type TransportMode = "fan_bus" | "train" | "shuttle" | "car";

export interface Transport {
  mode: TransportMode;
  origin: string;
  companions: "alone" | "friends" | "fan_bus";
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
}

export interface Plan {
  title: string;
  summary: string;
  items: PlanItem[];
  extra_day: { title: string; place_ids: string[] } | null;
  general?: boolean; // 장소 없이 만든 "일반 일정"
  generated_by?: "ai" | "rules";
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
}

export const EVENT_TYPES = [
  "start", "parent_open", "done", "change", "chat", "boarded",
  "share_kakao", "share_email", "share_copy", "intent",
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
}
