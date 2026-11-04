// /demo 시연용 고정 시나리오: "무릎이 편치 않은 어머니가 친구 두 분과 팬 모임 버스로 박서진 공연에 가신다. 굿즈는 꼭 사고 싶어 하신다."
// AI가 실패해도 generatePlan이 규칙 기반 일정으로 대신하므로 시연이 멈추지 않는다. 같은 입력은 캐시라 두 번째부터 즉시 열린다.
import "server-only";
import { createTrip, getConcert, getPlaces, getTripBy, listTripsLite, upsertConcert } from "./db.ts";
import { SEED_CONCERTS } from "./seed.ts";
import { generatePlan } from "./ai.ts";
import { concertView, ensureVenueFood, newToken } from "./trip.ts";
import { expiryFor } from "./time.ts";
import { EMPTY_TICKET } from "./schemas.ts";
import type { ParentProfile, Prefs, Transport, Trip } from "./types.ts";

export const DEMO_SRC = "demo";
export const DEMO_CONCERT = "psj-coex-1225";

const parent: ParentProfile = {
  honorific: "어머니", age_band: "60s", walk: "15-30", steps_usual: 5000, food: ["korean", "mild"], food_other: "",
  elevator_first: true, medicine_time: "13:00", rest_often: true, near_toilet: false, friends_fitness: "same",
};
const prefs: Prefs = { goods: true, photo: true, artist_places: true, fan_first: false, sightseeing: false };
const transport: Transport = {
  mode: "fan_bus", origin: "대구 수성구", companions: "friends", friends_count: 2, meet_place: "수성못 공영주차장", meet_time: "09:30",
  drop_point: "코엑스 동문 앞", return_time: "20:30", return_place: "코엑스 동문 앞", train_from: "", train_to: "", train_depart: "",
  train_arrive: "", train_return_depart: "", shuttle_info: "", stay: "day",
};

/** 최근 시연 일정이 있으면 그대로, 없으면 새로 만든다 */
export async function getOrCreateDemoTrip(fresh = false): Promise<Trip> {
  if (!fresh) {
    const demos = (await listTripsLite()).filter((t) => t.src === DEMO_SRC).sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const d of demos) {
      const t = await getTripBy("id", d.id);
      if (t?.plan && new Date(t.expires_at).getTime() > Date.now()) return t;
    }
  }
  let c = await getConcert(DEMO_CONCERT);
  if (!c) {
    // seed.sql이 실행되지 않았으면 1차 등록 공연을 넣어 둔다(이미 있는 공연은 건드리지 않음)
    for (const seed of SEED_CONCERTS) if (!(await getConcert(seed.id))) await upsertConcert({ ...seed });
    c = await getConcert(DEMO_CONCERT);
  }
  if (!c) throw new Error(`시연 공연(${DEMO_CONCERT})을 만들지 못했어요. Supabase concerts 테이블을 확인해 주세요`);
  await ensureVenueFood(c);
  const places = await getPlaces(c.id);
  const view = concertView({ custom_concert: null } as never, c);
  const plan = await generatePlan({ concert: view, parent, prefs, transport, seat: "B구역 12열", places });
  return createTrip({
    concert_id: c.id, custom_concert: null, parent_profile: parent, prefs, transport, seat: "B구역 12열", plan, plan_version: 1,
    parent_token: newToken(), kid_token: newToken(), kid_label: "딸", kid_name: "희주", kid_phone: "", src: DEMO_SRC,
    marketing_opt_in: false, expires_at: expiryFor(view.date), checklist: {},
    ticket: { ...EMPTY_TICKET, vendor: "티켓링크", pickup: "mobile", bus_car: "3호차", bus_seat: "12번", note: "버스 앞 유리에 '수성 서진' 종이" },
  });
}
