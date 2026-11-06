import { notFound } from "next/navigation";
import ParentHome from "@/components/ParentHome";
import { getParentData } from "./data";
import { fmtTimeKo, toHHMM, toMin } from "@/lib/time";
import { estimateSteps } from "@/lib/steps";
import { parentKit } from "@/lib/checklist";
import { EMPTY_TICKET } from "@/lib/schemas";
import { listFanPosts, listPosters, posterFor } from "@/lib/db";
import { artistPhoto, byNewest, FAN_ARTISTS, mockPosts } from "@/lib/community";

// P1 지금 할 일 (F7) + P4 귀가 안내 (F12)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const show = d.trip.plan!.items.find((i) => i.type === "show");
  const ret = d.trip.plan!.items.find((i) => i.type === "return");
  // 성지순례 여행은 공연이 없으니 귀가 시각이 되어야 귀가 화면으로 바뀐다
  const showEnd = d.concert.pilgrim ? ret?.start ?? "23:59" : d.concert.est_end_time || show?.end || toHHMM(toMin(d.concert.start_time) + 150);
  // 같은 가수 팬 라운지: 안내장을 받은 부모님(또는 링크를 본 다른 팬)이 라운지로 들어오게 최근 글 두 개를 미리 보여 준다
  const fan = FAN_ARTISTS.find((a) => a.name === d.concert.artist_display) ?? null;
  const loungePosts = fan ? [...(await listFanPosts({ artist: fan.slug, limit: 5 }).catch(() => [])), ...mockPosts().filter((x) => x.artist === fan.slug)].sort(byNewest).filter((x) => x.category !== "같이 가요").slice(0, 2) : [];
  const lounge = fan ? { slug: fan.slug, name: fan.name, fandom: fan.fandom, posts: loungePosts.map((x) => ({ id: x.id, title: x.title, comments: x.comments })) } : null;
  const placeNames = Object.fromEntries(d.places.map((p) => [p.id, { name: p.name, walk: p.walk_min_from_venue, lat: p.lat, lng: p.lng, fan: !!p.fan_type && p.fan_type !== "none" }]));
  return (
    <ParentHome
      token={token}
      plan={d.trip.plan!}
      concertDate={d.concert.date}
      concertTitle={d.concert.title}
      showEnd={showEnd}
      honorific={d.trip.parent_profile.honorific}
      kidLabel={d.trip.kid_label}
      done={d.done}
      opened={d.opened}
      placeNames={placeNames}
      stepsLine={estimateSteps(d.trip.plan!, d.places, d.trip.parent_profile).line}
      kit={parentKit({ concert: d.concert, parent: d.trip.parent_profile, prefs: d.trip.prefs, ticket: { ...EMPTY_TICKET, ...(d.trip.ticket ?? {}) } })}
      concertLine={d.concert.pilgrim ? `${d.concert.city} · ${fmtTimeKo(d.concert.start_time)} ${d.concert.venue_name}에서 출발` : `${d.concert.venue_name} · ${fmtTimeKo(d.concert.start_time)} 시작`}
      pilgrim={!!d.concert.pilgrim}
      artist={d.concert.artist_display}
      lounge={lounge}
      poster={d.concert.pilgrim ? artistPhoto(d.concert.artist_display) : posterFor(await listPosters(), { id: d.trip.concert_id, artist_display: d.concert.artist_display })}
    />
  );
}
