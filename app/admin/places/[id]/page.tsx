import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getConcert, getPlaces, listNoticeChecks, listTtPlaces } from "@/lib/db";
import { kakaoConfigured } from "@/lib/kakao-local";
import { aiEnabled } from "@/lib/ai";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminPlaces from "@/components/admin/AdminPlaces";

export const dynamic = "force-dynamic";
export const metadata = { title: "장소 관리 · 트롯트립", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return <AdminLogin configured={!!process.env.ADMIN_PASSWORD} />;
  const { id } = await params;
  const concert = await getConcert(id);
  if (!concert) notFound();
  const [places, rows, checks] = await Promise.all([getPlaces(id), listTtPlaces({ venue_key: concert.venue_key, concert_id: id }), listNoticeChecks(id, 3).catch(() => [])]);
  const scopeOf = Object.fromEntries(rows.map((r) => [r.id, r.venue_key ? "venue" : "concert"]));
  return (
    <main className="admin">
      <div className="top"><Link className="back" href="/admin">← 운영자 홈</Link><span className="brand">장소 관리</span></div>
      <AdminPlaces concert={concert} places={places} scopeOf={scopeOf} kakao={kakaoConfigured()} ai={aiEnabled()} checks={checks} />
    </main>
  );
}
