import Link from "next/link";

/** 팬 라운지 오른쪽 위 사람 아이콘 → 마이페이지 */
export default function MeIcon() {
  return (
    <Link href="/fan/me" aria-label="마이페이지" style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: "50%", color: "var(--ink)" }}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c1.5-3.6 4.5-5.5 8-5.5s6.5 1.9 8 5.5" />
      </svg>
    </Link>
  );
}
