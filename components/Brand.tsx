import Link from "next/link";

export default function Brand({ href = "/" }: { href?: string | null }) {
  const inner = <>트롯<i>트립</i></>;
  return href ? <Link href={href} className="brand">{inner}</Link> : <span className="brand">{inner}</span>;
}
