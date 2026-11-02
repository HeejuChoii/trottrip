// 트립 관련 서버 헬퍼
import "server-only";
import { randomBytes } from "crypto";
import { getConcert, getPlaces, getTripBy } from "./db.ts";
import type { Concert, ConcertView, Place, Trip } from "./types.ts";
import type { PlanInput } from "./planner.ts";

/** 추측 불가 토큰 (128비트) */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export function concertView(trip: Trip, concert: Concert | null): ConcertView {
  if (concert) return { ...concert, custom: false };
  const c = trip.custom_concert!;
  return {
    id: null, title: c.title, artist_display: "", color: "#087E72", city: "", venue_name: c.venue_name,
    venue_lat: null, venue_lng: null, date: c.date, start_time: c.start_time, est_end_time: null,
    notice_text: "", gate_map: {}, zone_image_url: null, official_map_url: null, info_desk_place_id: null, custom: true,
  };
}

export interface LoadedTrip {
  trip: Trip;
  concert: ConcertView;
  places: Place[];
  input: PlanInput;
}

export async function loadTrip(by: "parent_token" | "kid_token", token: string): Promise<LoadedTrip | null> {
  const trip = await getTripBy(by, token);
  if (!trip) return null;
  const c = trip.concert_id ? await getConcert(trip.concert_id) : null;
  const concert = concertView(trip, c);
  const places = trip.concert_id ? await getPlaces(trip.concert_id) : [];
  return {
    trip, concert, places,
    input: { concert, parent: trip.parent_profile, prefs: trip.prefs, transport: trip.transport, seat: trip.seat, places },
  };
}

export function isExpired(trip: Trip): boolean {
  return new Date(trip.expires_at).getTime() < Date.now();
}
