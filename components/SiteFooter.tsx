import Link from "next/link";

/** 화면 맨 아래 작은 글씨: 개인정보처리방침 · 이용약관 */
export default function SiteFooter() {
  return (
    <footer style={{ textAlign: "center", fontSize: 11, color: "#9aa5ab", padding: "8px 0 4px", lineHeight: 1.6 }}>
      <Link href="/privacy" style={{ color: "inherit" }}>개인정보처리방침</Link> · <Link href="/terms" style={{ color: "inherit" }}>이용약관</Link>
      <br />© 트롯트립
    </footer>
  );
}
