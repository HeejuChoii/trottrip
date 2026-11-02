import { notFound } from "next/navigation";
import KidPlan from "@/components/KidPlan";
import { loadTrip } from "@/lib/trip";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "완성된 일정 · 트롯트립" };

// K5 완성된 일정 · 공유 · 결제 의향
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadTrip("kid_token", token);
  if (!loaded?.trip.plan) notFound();
  const { trip, concert, places } = loaded;
  return (
    <KidPlan
      kidToken={trip.kid_token}
      parentToken={trip.parent_token}
      plan={trip.plan!}
      concert={concert}
      places={places}
      parentHonorific={trip.parent_profile.honorific}
      share={{ kid_label: trip.kid_label, kid_name: trip.kid_name, kid_phone: trip.kid_phone }}
      kakaoKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? ""}
    />
  );
}
