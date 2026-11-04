// 요청 입력 검증 (zod)
import { z } from "zod";

const hhmm = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$|^$/, "시각은 HH:MM").default("");
const s = (max = 100) => z.string().trim().max(max).default("");

export const ParentSchema = z.object({
  honorific: s(20).transform((v) => v || "부모님"),
  age_band: z.enum(["40s", "50s", "60s", "70+"]).default("60s"),
  walk: z.enum(["30+", "15-30", "15-"]).default("15-30"),
  steps_usual: z.number().int().refine((v) => [0, 5000, 10000, 15000].includes(v)).default(0),
  rest_often: z.boolean().default(false),
  near_toilet: z.boolean().default(false),
  elevator_first: z.boolean().default(false),
  food: z.array(z.enum(["korean", "mild", "seafood", "quick", "any"])).default([]),
  food_other: s(60),
  medicine_time: hhmm,
  friends_fitness: z.enum(["same", "better"]).default("same"),
});

export const PrefsSchema = z.object({
  goods: z.boolean().default(false),
  photo: z.boolean().default(false),
  artist_places: z.boolean().default(false),
  fan_first: z.boolean().default(false),
  sightseeing: z.boolean().default(false),
});

export const TransportSchema = z.object({
  mode: z.enum(["fan_bus", "train", "shuttle", "car"]).default("fan_bus"),
  origin: s(60),
  companions: z.enum(["alone", "friends", "fan_bus", "family"]).default("alone"),
  friends_count: z.number().int().min(0).max(50).default(0),
  meet_place: s(60), meet_time: hhmm, drop_point: s(60), return_time: hhmm, return_place: s(60),
  train_from: s(40), train_to: s(40), train_depart: hhmm, train_arrive: hhmm, train_return_depart: hhmm,
  shuttle_info: s(300),
  stay: z.enum(["day", "overnight"]).default("day"),
});

export const CustomConcertSchema = z.object({
  title: z.string().trim().min(1, "공연명을 입력해 주세요").max(100),
  venue_name: z.string().trim().min(1, "공연장을 입력해 주세요").max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 입력해 주세요"),
  start_time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "시작 시각을 입력해 주세요"),
});

export const CreateTripSchema = z.object({
  concert_id: z.string().max(100).nullable().default(null),
  custom_concert: CustomConcertSchema.nullable().default(null),
  parent_profile: ParentSchema,
  prefs: PrefsSchema,
  transport: TransportSchema,
  seat: s(40),
  src: s(40),
  privacy_ok: z.literal(true, { message: "개인정보 수집·이용에 동의해 주세요" }),
  marketing_opt_in: z.boolean().default(false),
}).refine((v) => !!v.concert_id || !!v.custom_concert, { message: "공연을 골라 주세요" });

export const ShareInfoSchema = z.object({
  kid_label: s(10),
  kid_name: s(20),
  kid_phone: z.string().trim().max(20).regex(/^[0-9\-\s+]*$/, "번호는 숫자만").default(""),
});

export const ConcertAdminSchema = z.object({
  id: z.string().trim().min(1).max(60).regex(/^[a-z0-9\-_]+$/i, "id는 영문·숫자·-"),
  concertrip_id: z.string().trim().max(100).nullable().transform((v) => v || null),
  title: z.string().trim().min(1).max(100),
  artist_display: s(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#087E72"),
  city: s(20),
  venue_name: z.string().trim().min(1).max(100),
  venue_key: z.string().trim().max(40).regex(/^[a-z0-9\-]*$/, "공연장 키는 영문 소문자·숫자·-").nullable().default(null).transform((v) => v || null),
  venue_lat: z.number().nullable().default(null),
  venue_lng: z.number().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
  est_end_time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  notice_text: s(1000),
  gate_map: z.record(z.string(), z.string()).default({}),
  zone_image_url: z.string().url().nullable().default(null),
  official_map_url: z.string().url().nullable().default(null),
  info_desk_place_id: z.string().max(100).nullable().default(null),
  active: z.boolean().default(true),
});

export const TicketSchema = z.object({
  vendor: s(30),
  pickup: z.enum(["", "mobile", "onsite", "paper"]).default(""),
  booker_name: s(20),
  id_check: z.boolean().default(true),
  bus_car: s(20),
  bus_seat: s(20),
  note: s(200),
});

export const EMPTY_TICKET = TicketSchema.parse({});
