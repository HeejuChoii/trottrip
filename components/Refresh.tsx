"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Refresh() {
  const router = useRouter();
  const [at, setAt] = useState("");
  return (
    <button className="mini-btn" onClick={() => { router.refresh(); setAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })); }}>
      새로고침{at ? ` · ${at}` : ""}
    </button>
  );
}
