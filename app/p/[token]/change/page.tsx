import { notFound } from "next/navigation";
import { getParentData } from "../data";
import ParentChange from "@/components/ParentChange";
import { kidHonorific } from "@/lib/text";

// P3 일정 바꾸기 (F11)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  return <ParentChange token={token} kidH={kidHonorific(d.trip.kid_label)} kidLabel={d.trip.kid_label} />;
}
