import { redirect } from "next/navigation";

// 내 티켓은 '공연장 · 내 티켓' 화면으로 합쳤다(예전 링크 호환)
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/p/${token}/venue`);
}
