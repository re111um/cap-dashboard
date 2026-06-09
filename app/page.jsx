"use client";
import { useState } from "react";
import DashboardView from "@/components/DashboardView";

const BASE = "#5E51FF";

// 오늘 기준 현재 월을 "YYYY-MM" 형식으로 반환 (DashboardView와 동일 로직)
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Home() {
  const [phase, setPhase] = useState("login"); // login | dashboard | admin
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [dashData, setDashData] = useState(null);

  const login = async () => {
    setErr(""); setLoading(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, incRet: false, incPerf: false, asOfMonth: currentMonth() }),
      });
      if (res.status === 401) { setErr("비밀번호가 일치하지 않습니다"); setLoading(false); return; }
      if (res.status === 404) { setErr("데이터가 없습니다. 관리자에게 문의하세요."); setLoading(false); return; }
      const data = await res.json();
      if (data.error) { setErr("서버 오류가 발생했습니다"); setLoading(false); return; }
      setDashData(data);
      setPhase("dashboard");
    } catch { setErr("서버 연결에 실패했습니다"); }
    setLoading(false);
  };

  if (phase === "dashboard") {
    return <DashboardView initialData={dashData} password={password} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#0A0F1C,#131B2E,#1A1510)", fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div style={{ background: "rgba(20,26,40,0.85)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "48px 40px", width: 360, textAlign: "center", backdropFilter: "blur(20px)", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: BASE, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Featuring</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#E8E4DC", marginBottom: 6 }}>연봉 대시보드</div>
        <div style={{ fontSize: 13, color: "rgba(232,228,220,0.4)", marginBottom: 32 }}>접근 권한이 필요합니다</div>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"} value={password}
            onChange={(e) => { setPassword(e.target.value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/g, "")); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="비밀번호 입력"
            style={{ width: "100%", boxSizing: "border-box", padding: "14px 40px 14px 16px", background: "rgba(255,255,255,0.04)", border: err ? "1px solid #E85454" : "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#E8E4DC", fontSize: 14, outline: "none" }}
          />
          <span onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 14, color: "rgba(232,228,220,0.4)", userSelect: "none" }}>{showPw ? "🙈" : "👁"}</span>
        </div>
        {err && <div style={{ color: "#E85454", fontSize: 12, marginTop: 8 }}>{err}</div>}
        {loading && <div style={{ color: "rgba(232,228,220,0.5)", fontSize: 12, marginTop: 8 }}>인증 중...</div>}
        <button onClick={login} disabled={loading} style={{ marginTop: 20, width: "100%", padding: "14px 0", background: "linear-gradient(135deg,#5E51FF,#7B6FFF)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>접속</button>
      </div>
    </div>
  );
}
