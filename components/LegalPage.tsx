import Link from "next/link";
import Brand from "./Brand";

/** 약관·방침 공통 틀(작은 글씨, 조항 목록) */
export default function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <main className="shell" style={{ fontSize: 14, lineHeight: 1.7 }}>
      <div className="top"><Brand href="/" /><Link className="back" href="/">처음으로</Link></div>
      <h1 className="h" style={{ fontSize: 22 }}>{title}</h1>
      <p className="note" style={{ textAlign: "left", margin: 0 }}>시행일 {updated} · 트롯트립은 해커톤 시범 운영 중인 서비스예요.</p>
      {sections.map((s) => (
        <section key={s.h} className="card">
          <b>{s.h}</b>
          {s.p.map((t, i) => <p key={i} style={{ margin: "6px 0 0", color: "var(--ink)" }}>{t}</p>)}
        </section>
      ))}
    </main>
  );
}
