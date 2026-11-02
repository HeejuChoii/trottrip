import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell pv">
      <h1 className="h">페이지를 찾을 수 없어요</h1>
      <p className="hello">링크를 다시 한번 확인해 주세요.</p>
      <Link className="cta" href="/">트롯트립 처음으로</Link>
    </main>
  );
}
