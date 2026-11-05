"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ls } from "@/lib/client";

/** 첫 화면·팬 라운지 아래 탭: 자녀용(공연 날·팬덤 스팟 여행 선물) / 팬 라운지(가수별 커뮤니티) */
export default function HomeTabs() {
  const path = usePathname() ?? "/";
  const fan = path.startsWith("/fan");
  return (
    <nav className="tabs2" aria-label="메뉴">
      <Link href="/" className={!fan ? "on" : ""} onClick={() => ls.set("tt_role", "kid")}>👨‍👩‍👧 자녀용</Link>
      <Link href="/fan" className={fan ? "on" : ""} onClick={() => ls.set("tt_role", "fan")}>💖 팬 라운지</Link>
    </nav>
  );
}
