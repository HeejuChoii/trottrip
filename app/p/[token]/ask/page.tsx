import { notFound } from "next/navigation";
import { getParentData } from "../data";
import { listChats } from "@/lib/db";
import ParentAsk from "@/components/ParentAsk";
import { kidHonorific } from "@/lib/text";

// P6 물어보기 (F10)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await getParentData(token);
  if (!d || d.expired) notFound();
  const chats = await listChats(d.trip.id);
  return <ParentAsk token={token} kidH={kidHonorific(d.trip.kid_label)} history={chats.map((c) => ({ role: c.role, text: c.text }))} mode={d.trip.transport.mode} pilgrim={!!d.concert.pilgrim} />;
}
