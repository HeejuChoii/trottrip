"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import { captureSrc, ss } from "@/lib/client";

export default function Start() {
  const router = useRouter();
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { captureSrc(); }, []);

  function start() {
    if (!privacy) { setErr("개인정보 수집·이용에 동의해 주세요."); return; }
    ss.set("tt_consent", JSON.stringify({ privacy, marketing }));
    router.push("/new");
  }

  return (
    <main className="shell">
      <div className="top"><Brand href={null} /><span className="eb">얼리버드 <s>3,900원</s> 0원</span></div>
      <div className="hero2"><b>엄마 혼자 콘서트<br />보내드려도 안심</b><p>부모님의 최애를 만나러 가는 길, 여행까지 선물하세요.</p></div>
      <div className="st3">
        <div><i>1</i><span>공연과 부모님 정보를 넣어요</span></div>
        <div><i>2</i><span>AI가 공연 날 하루를 짜요<br />밥집 · 쉴 곳 · 굿즈 · 입구 · 귀가까지</span></div>
        <div><i>3</i><span>링크로 부모님께 보내요<br />앱 설치 없이 큰 글씨로 보세요</span></div>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14.5 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" checked={privacy} onChange={(e) => { setPrivacy(e.target.checked); setErr(""); }} style={{ width: 22, height: 22, flex: "none" }} />
          <span><b>(필수)</b> 개인정보 수집·이용 동의<br /><small style={{ color: "var(--sub)", lineHeight: 1.5 }}>부모님 연령대·걷기·식사 정보와 출발지·이동 정보를 일정 만드는 데에만 써요. 부모님 이름·연락처와 위치는 받지 않아요. 공연 다음 날 링크가 만료돼요.</small></span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} style={{ width: 22, height: 22, flex: "none" }} />
          <span>(선택) 마케팅 정보 수신 동의<br /><small style={{ color: "var(--sub)" }}>정식 출시 소식을 알려 드려요. 언제든 거부할 수 있어요.</small></span>
        </label>
        {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
      </div>
      <button className="cta" onClick={start}>바로 시작하기</button>
      <p className="fine">로그인 없이 바로 시작해요. 해커톤 기간 얼리버드는 무료예요.</p>
    </main>
  );
}
