"use client";
import { useState, useMemo, useCallback } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";

const BASE = "#5E51FF";
const opacity = (a) => `rgba(94,81,255,${a})`;
const TABS = [
  { key: "dept", label: "본부별" },
  { key: "team", label: "조직별" },
  { key: "rank", label: "직급별" },
  { key: "job", label: "직무별" },
];

const fmt = (v) => `${Math.round(v / 1e4).toLocaleString()}만원`;
const fmtM = (v) => `${Math.round(v / 1e4).toLocaleString()}`;
function barColors(n) { return Array.from({ length: n }, (_, i) => opacity(1 - i * (0.55 / Math.max(n - 1, 1)))); }

/* ─── Custom Tooltip ─── */
function ChartTip({ active, payload, label, showTotal, showAvg }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background: "rgba(15,18,30,0.96)", border: `1px solid ${opacity(0.25)}`, borderRadius: 10, padding: "14px 18px", color: "#E8E4DC", fontSize: 13, lineHeight: 1.8, maxWidth: 300 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 2 }}>{label}</div>
      <div style={{ color: opacity(0.7) }}>인원 <span style={{ color: "#fff", fontWeight: 600 }}>{d.count}명</span></div>
      {showTotal && <div style={{ color: opacity(0.7) }}>연봉 합계 <span style={{ color: "#fff", fontWeight: 600 }}>{fmt(d.total)}</span></div>}
      {showAvg && <div style={{ color: "#4AC978" }}>평균 연봉 <span style={{ color: "#fff", fontWeight: 600 }}>{fmt(d.avg)}</span></div>}
      {d.retInc > 0 && <div style={{ color: "#A89BFF" }}>리텐션/사이닝 <span style={{ color: "#fff" }}>{fmt(d.retInc)}</span></div>}
      {d.perfInc > 0 && <div style={{ color: "#C4B0FF" }}>성과 인센티브 <span style={{ color: "#fff" }}>{fmt(d.perfInc)}</span></div>}
    </div>
  );
}

/* ─── Range Chart ─── */
function RangeChart({ distData }) {
  if (!distData.length) return null;
  const globalMin = Math.min(...distData.map((d) => d.min));
  const globalMax = Math.max(...distData.map((d) => d.max));
  const pad = (globalMax - globalMin) * 0.06 || 1;
  const lo = globalMin - pad, hi = globalMax + pad;
  const pct = (v) => ((v - lo) / (hi - lo)) * 100;
  const [hover, setHover] = useState(null);
  const ticks = [globalMin, Math.round((globalMin + globalMax) / 2), globalMax];

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, justifyContent: "flex-end" }}>
        {[{ l: "최저", c: "#E85454" }, { l: "중간값", c: "#4AC978" }, { l: "최고", c: BASE }].map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(232,228,220,0.45)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: x.c }} />{x.l}
          </div>
        ))}
      </div>
      {distData.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", height: 44, position: "relative" }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <div style={{ width: 140, flexShrink: 0, textAlign: "right", paddingRight: 14, fontSize: 13, fontWeight: 500, color: "rgba(232,228,220,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
          <div style={{ flex: 1, position: "relative", height: 20 }}>
            <div style={{ position: "absolute", left: `${pct(d.min)}%`, width: `${pct(d.max) - pct(d.min)}%`, top: 9, height: 2, background: "rgba(255,255,255,0.12)" }} />
            <div style={{ position: "absolute", left: `${pct(d.min)}%`, top: 5, width: 10, height: 10, borderRadius: "50%", background: "#E85454", transform: "translateX(-50%)", transition: "transform .15s", ...(hover === i && { transform: "translateX(-50%) scale(1.3)" }) }} />
            <div style={{ position: "absolute", left: `${pct(d.median)}%`, top: 4, width: 12, height: 12, borderRadius: "50%", background: "#4AC978", transform: "translateX(-50%)", border: "2px solid rgba(15,18,30,0.8)", transition: "transform .15s", ...(hover === i && { transform: "translateX(-50%) scale(1.3)" }) }} />
            <div style={{ position: "absolute", left: `${pct(d.max)}%`, top: 5, width: 10, height: 10, borderRadius: "50%", background: BASE, transform: "translateX(-50%)", transition: "transform .15s", ...(hover === i && { transform: "translateX(-50%) scale(1.3)" }) }} />
          </div>
          {hover === i && (
            <div style={{ position: "absolute", right: 0, top: -36, background: "rgba(15,18,30,0.96)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#E8E4DC", whiteSpace: "nowrap", zIndex: 10, pointerEvents: "none" }}>
              <span style={{ color: "#E85454" }}>{fmt(d.min)}</span>{" / "}
              <span style={{ color: "#4AC978" }}>{fmt(d.median)}</span>{" / "}
              <span style={{ color: BASE }}>{fmt(d.max)}</span>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginLeft: 140, marginTop: 8 }}>
        {ticks.map((t, i) => <div key={i} style={{ fontSize: 11, color: "rgba(232,228,220,0.3)" }}>{fmt(t)}</div>)}
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function DashboardView({ initialData, password }) {
  const [tab, setTab] = useState("dept");
  const [incRet, setIncRet] = useState(false);
  const [incPerf, setIncPerf] = useState(false);
  const [hideClv, setHideClv] = useState(false);
  const [showTotal, setShowTotal] = useState(true);
  const [showAvg, setShowAvg] = useState(false);
  const [data, setData] = useState(initialData);
  const [fetching, setFetching] = useState(false);

  const refetch = useCallback(async (opts = {}) => {
    setFetching(true);
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        incRet: opts.incRet ?? incRet,
        incPerf: opts.incPerf ?? incPerf,
        hideClv: opts.hideClv ?? hideClv,
      }),
    });
    const d = await res.json();
    if (!d.error) setData(d);
    setFetching(false);
  }, [password, incRet, incPerf, hideClv]);

  const toggle = (field, current) => {
    const next = !current;
    const newOpts = { incRet, incPerf, hideClv, [field]: next };
    if (field === "incRet") setIncRet(next);
    if (field === "incPerf") setIncPerf(next);
    if (field === "hideClv") setHideClv(next);
    refetch(newOpts);
  };

  const toggleTotal = () => { if (showTotal && !showAvg) return; setShowTotal(!showTotal); };
  const toggleAvg = () => { if (showAvg && !showTotal) return; setShowAvg(!showAvg); };

  const tabData = data?.tabs?.[tab];
  const chartData = tabData?.agg || [];
  const distData = tabData?.dist || [];
  const colors = useMemo(() => barColors(chartData.length), [chartData.length]);

  const S = {
    wrap: { minHeight: "100vh", background: "linear-gradient(160deg,#0A0F1C,#111827,#150F20)", fontFamily: "'Noto Sans KR','Pretendard',sans-serif", color: "#E8E4DC", padding: "32px 24px" },
    panel: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "28px 20px 16px", marginBottom: 20 },
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" },
    tabBtn: (on) => ({ padding: "9px 18px", borderRadius: 8, border: "none", background: on ? "rgba(94,81,255,0.2)" : "transparent", color: on ? "#A89BFF" : "rgba(232,228,220,0.45)", fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }),
    chk: (on, c) => ({ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: on ? "none" : "1.5px solid rgba(255,255,255,0.2)", background: on ? (c || BASE) : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }),
  };
  const ChkSvg = <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

  const ChkLabel = ({ on, onClick, label, color, disabled }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: on ? (color || "#A89BFF") : "rgba(232,228,220,0.45)", opacity: disabled ? 0.4 : 1 }}>
      <div onClick={disabled ? undefined : onClick} style={S.chk(on, color)}>{on && ChkSvg}</div>
      <span>{label}</span>
    </label>
  );

  if (!data) return null;

  const descText = incRet && incPerf ? "기본 연봉 + 리텐션/사이닝 + 성과 인센티브 포함" : incRet ? "기본 연봉 + 리텐션/사이닝 인센티브 포함" : incPerf ? "기본 연봉 + 성과 인센티브 포함" : "기본 연봉만 표시";
  const curLabel = TABS.find((t) => t.key === tab)?.label || "";

  return (
    <div style={S.wrap}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}`}</style>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: BASE, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Featuring</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>연봉 대시보드</h1>
            <div style={{ fontSize: 13, color: "rgba(232,228,220,0.4)", marginTop: 4 }}>총 {data.totalCount}명</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.4)" }}>총 연봉 합계</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{fmt(data.totalSalary)}</div>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginTop: 2 }}>월 {fmt(data.monthlySalary)}</div>
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { l: "기본 연봉 총합", v: data.baseSalaryTotal, c: BASE },
            { l: "리텐션/사이닝 총합", v: data.totalRetInc, c: "#A89BFF" },
            { l: "'26 1분기 성과 총합", v: data.totalPerfInc, c: "#C4B0FF" },
          ].map((c, i) => (
            <div key={i} style={S.card}>
              <div style={{ fontSize: 11, color: "rgba(232,228,220,0.45)", marginBottom: 6 }}>{c.l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.c }}>{fmt(c.v)}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
            {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} style={S.tabBtn(tab === t.key)}>{t.label}</button>)}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <ChkLabel on={incRet} onClick={() => toggle("incRet", incRet)} label="리텐션/사이닝" color="#A89BFF" />
            <ChkLabel on={incPerf} onClick={() => toggle("incPerf", incPerf)} label="'26 1분기 성과" color="#C4B0FF" />
            <ChkLabel on={hideClv} onClick={() => toggle("hideClv", hideClv)} label="C-lv 제외" color="#E85454" />
          </div>
        </div>

        {fetching && <div style={{ textAlign: "center", padding: 20, color: "rgba(232,228,220,0.4)", fontSize: 13 }}>데이터 갱신 중...</div>}

        {/* Bar + Line Chart */}
        <div style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{curLabel} 연봉</div>
            <div style={{ display: "flex", gap: 12 }}>
              <ChkLabel on={showTotal} onClick={toggleTotal} label="합계" color={BASE} disabled={showTotal && !showAvg} />
              <ChkLabel on={showAvg} onClick={toggleAvg} label="평균" color="#4AC978" disabled={showAvg && !showTotal} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginBottom: 20, paddingLeft: 8 }}>{descText}</div>
          <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 52 + 40)}>
            <ComposedChart data={chartData} layout="vertical" margin={{ top: 0, right: 70, bottom: 0, left: 8 }} barCategoryGap="28%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={140} tick={{ fill: "rgba(232,228,220,0.7)", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip showTotal={showTotal} showAvg={showAvg} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              {showTotal && (
                <Bar dataKey="total" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v) => fmt(v), fill: "rgba(232,228,220,0.5)", fontSize: 11 }}>
                  {chartData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                </Bar>
              )}
              {showAvg && (
                <Line type="monotone" dataKey="avg" stroke="#4AC978" strokeWidth={2} dot={{ r: 5, fill: "#4AC978", stroke: "rgba(15,18,30,0.8)", strokeWidth: 2 }}
                  label={!showTotal ? { position: "right", formatter: (v) => fmt(v), fill: "#4AC978", fontSize: 11 } : false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Range Chart */}
        <div style={S.panel}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, paddingLeft: 8 }}>{curLabel} 연봉 분포</div>
          <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginBottom: 16, paddingLeft: 8 }}>개인 연봉 기준 최저 / 중간값 / 최고</div>
          <RangeChart distData={distData} />
        </div>

        {/* Table */}
        <div style={{ ...S.panel, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>상세 데이터</span>
            <span style={{ fontSize: 12, color: "rgba(232,228,220,0.35)" }}>(단위: 만원)</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[curLabel.replace("별", ""), "인원", "인원 비율", "연봉 합계", "월급 합계", "연봉 비율", ...(incRet ? ["리텐션/사이닝"] : []), ...(incPerf ? ["성과"] : []), "평균 연봉", "총합"].map((h, i) => (
                    <th key={i} style={{ padding: "12px 16px", textAlign: i === 0 ? "left" : "right", color: "rgba(232,228,220,0.4)", fontWeight: 600, fontSize: 11, letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((d, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#fff" }}>{d.name}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.6)" }}>{d.count}명</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.4)" }}>{d.countPct}%</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#A89BFF" }}>{fmtM(d.baseSalary)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(168,155,255,0.6)" }}>{fmtM(d.monthly)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.4)" }}>{d.totalPct}%</td>
                    {incRet && <td style={{ padding: "12px 16px", textAlign: "right", color: "#C4B0FF" }}>{d.retInc > 0 ? fmtM(d.retInc) : "-"}</td>}
                    {incPerf && <td style={{ padding: "12px 16px", textAlign: "right", color: "#C4B0FF" }}>{d.perfInc > 0 ? fmtM(d.perfInc) : "-"}</td>}
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.6)" }}>{fmtM(d.avg)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#fff" }}>{fmtM(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "rgba(232,228,220,0.2)" }}>Confidential · Featuring Inc. · 의사결정권자 전용</div>
      </div>
    </div>
  );
}
