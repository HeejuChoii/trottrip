import Wizard from "@/components/Wizard";
import { ensureSeedConcerts, listConcerts, listPosters, placeCounts, posterFor } from "@/lib/db";
import { artistPhoto } from "@/lib/community";
import { nowKST } from "@/lib/time";
import { courseSpots, pilgrimArtists, pilgrimCourses } from "@/lib/pilgrim";

export const dynamic = "force-dynamic";

// K1~K4 (?mode=fan: 공연 없이 성지순례 여행)
export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const today = nowKST().date;
  await ensureSeedConcerts().catch(() => undefined);
  const [concerts, counts, posters] = await Promise.all([listConcerts(true), placeCounts(), listPosters()]);
  const upcoming = concerts.filter((c) => c.date >= today).map((c) => ({ ...c, place_count: counts[c.id]?.count ?? 0, poster: posterFor(posters, c) }));
  const courses = pilgrimCourses().map((c) => ({
    id: c.id, artist: c.artist, title: c.title, region: c.region, blurb: c.blurb, start: c.start.name, poster: artistPhoto(c.artist) ?? posters[c.artist] ?? null,
    spots: courseSpots(c).map((p) => ({ name: p.name, kind: p.category })),
  }));
  return <Wizard concerts={upcoming} artists={pilgrimArtists()} courses={courses} initialMode={mode === "fan" ? "fan" : "concert"} />;
}
