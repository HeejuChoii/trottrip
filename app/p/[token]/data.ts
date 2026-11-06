import "server-only";
import { cache } from "react";
import { listEvents } from "@/lib/db";
import { isExpired, loadTrip } from "@/lib/trip";

export const getParentData = cache(async (token: string) => {
  const loaded = await loadTrip("parent_token", token);
  if (!loaded?.trip.plan) return null;
  if (isExpired(loaded.trip)) return { expired: true as const, ...loaded };
  const events = await listEvents(loaded.trip.id);
  const done = events.filter((e) => (e.type === "done" || e.type === "boarded") && e.item_id).map((e) => e.item_id!);
  return { expired: false as const, ...loaded, done, opened: events.some((e) => e.type === "parent_open" && e.payload?.owner !== true) };
});
