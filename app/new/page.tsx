import Wizard from "@/components/Wizard";
import { listConcerts, placeCounts } from "@/lib/db";
import { nowKST } from "@/lib/time";

export const dynamic = "force-dynamic";

// K1~K4
export default async function Page() {
  const today = nowKST().date;
  const [concerts, counts] = await Promise.all([listConcerts(true), placeCounts()]);
  const upcoming = concerts.filter((c) => c.date >= today).map((c) => ({ ...c, place_count: counts[c.id]?.count ?? 0 }));
  return <Wizard concerts={upcoming} />;
}
