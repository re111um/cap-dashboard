"use client";
import { useState, useMemo, useCallback, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
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

/* ─── Multi-line X축 Tick (긴 한국어 레이블 줄바꿈) ─── */
function splitLabel(text) {
  if (!text || text.length <= 5) return [text || ""];
  const suffixes = ["본부", "그룹", "팀"];
  for (const sx of suffixes) {
    if (text.endsWith(sx) && text.length - sx.length >= 2) {
      return [text.slice(0, text.length - sx.length), sx];
    }
  }
  const mid = Math.ceil(text.length / 2);
  return [text.slice(0, mid), text.slice(mid)];
}

function MultiLineTick({ x, y, payload }) {
  const lines = splitLabel(payload?.value);
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text key={i} x={0} y={14 + i * 13} textAnchor="middle" fill="rgba(232,228,220,0.65)" fontSize={11} fontWeight={500}>
          {line}
        </text>
      ))}
    </g>
  );
}

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

/* ─── Upload Panel ─── */
function UploadPanel({ password, onSuccess }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(null);
  const [count, setCount] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      setStatus("error");
      setErrMsg("CSV 파일만 업로드 가능합니다.");
      return;
    }
    setStatus("loading");
    try {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buffer);
      // UTF-8로 읽었을 때 한글 키워드가 없으면 EUC-KR로 재디코딩
      if (!text.includes("본부") && !text.includes("계약")) {
        text = new TextDecoder("euc-kr").decode(buffer);
      }
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, csvText: text }),
      });
      const d = await res.json();
      if (d.success) {
        setStatus("success");
        setCount(d.count);
        onSuccess();
      } else {
        setStatus("error");
        setErrMsg(
          d.error === "parse_failed" ? "CSV 파싱 실패. 파일 형식을 확인해주세요." :
          d.error === "unauthorized" ? "비밀번호 오류가 발생했습니다." :
          d.error === "storage_unavailable" ? "저장 공간에 접근할 수 없습니다. Vercel KV 설정이 필요합니다." :
          "업로드에 실패했습니다."
        );
      }
    } catch {
      setStatus("error");
      setErrMsg("네트워크 오류가 발생했습니다.");
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => status !== "loading" && status !== "success" && inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${
          dragging ? BASE :
          status === "success" ? "#4AC978" :
          status === "error" ? "#E85454" :
          "rgba(255,255,255,0.12)"
        }`,
        borderRadius: 10,
        padding: "24px 20px",
        textAlign: "center",
        cursor: status === "loading" || status === "success" ? "default" : "pointer",
        background: dragging ? "rgba(94,81,255,0.05)" : "transparent",
        transition: "border-color .2s, background .2s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: "none" }}
        onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }}
      />
      {status === "loading" && <div style={{ color: "rgba(232,228,220,0.4)", fontSize: 13 }}>업로드 중...</div>}
      {status === "success" && (
        <div style={{ color: "#4AC978", fontSize: 13 }}>{count}명 데이터 업로드 완료. 대시보드가 갱신됩니다.</div>
      )}
      {status === "error" && (
        <div>
          <div style={{ color: "#E85454", fontSize: 13, marginBottom: 10 }}>{errMsg}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setStatus(null); }}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(232,228,220,0.4)", fontSize: 11, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}
          >
            다시 시도
          </button>
        </div>
      )}
      {!status && (
        <>
          <div style={{ fontSize: 13, color: "rgba(232,228,220,0.4)", marginBottom: 4 }}>CSV 파일을 드래그하거나 클릭하여 선택</div>
          <div style={{ fontSize: 11, color: "rgba(232,228,220,0.2)" }}>업로드 시 기존 데이터가 즉시 교체됩니다</div>
        </>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─── */
export default function DashboardView({ initialData, password }) {
  const [tab, setTab] = useState("dept");
  const [incRet, setIncRet] = useState(false);
  const [incPerf, setIncPerf] = useState(false);
  const [showTotal, setShowTotal] = useState(true);
  const [showAvg, setShowAvg] = useState(false);
  const [asOfDate, setAsOfDate] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
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
        asOfDate: "asOfDate" in opts ? opts.asOfDate : asOfDate,
      }),
    });
    const d = await res.json();
    if (!d.error) setData(d);
    setFetching(false);
  }, [password, incRet, incPerf, asOfDate]);

  const toggle = (field, current) => {
    const next = !current;
    const newOpts = { incRet, incPerf, [field]: next };
    if (field === "incRet") setIncRet(next);
    if (field === "incPerf") setIncPerf(next);
    refetch(newOpts);
  };

  const toggleTotal = () => { if (showTotal && !showAvg) return; setShowTotal(!showTotal); };
  const toggleAvg = () => { if (showAvg && !showTotal) return; setShowAvg(!showAvg); };

  const handleUploadSuccess = useCallback(() => { refetch({}); }, [refetch]);

  const tabData = data?.tabs?.[tab];
  const chartData = tabData?.agg || [];
  const distData = tabData?.dist || [];
  const colors = useMemo(() => barColors(chartData.length), [chartData.length]);
  const yMax = useMemo(() => {
    if (!chartData.length) return 1;
    const vals = [
      ...(showTotal ? chartData.map((d) => d.total) : []),
      ...(showAvg ? chartData.map((d) => d.avg) : []),
    ];
    return Math.max(...vals, 1);
  }, [chartData, showTotal, showAvg]);

  const S = {
    wrap: { minHeight: "100vh", background: "linear-gradient(160deg,#0A0F1C,#111827,#150F20)", fontFamily: "'Noto Sans KR','Pretendard',sans-serif", color: "#E8E4DC", padding: "32px 24px" },
    panel: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "28px 20px 16px", marginBottom: 20 },
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" },
    tabBtn: (on) => ({ padding: "9px 18px", borderRadius: 8, border: "none", background: on ? "rgba(94,81,255,0.2)" : "transparent", color: on ? "#A89BFF" : "rgba(232,228,220,0.45)", fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }),
    chk: (on, c) => ({ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: on ? "none" : "1.5px solid rgba(255,255,255,0.2)", background: on ? (c || BASE) : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }),
  };
  const ChkSvg = <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;

  const ChkLabel = ({ on, onClick, label, color, disabled }) => (
    <label
      onClick={disabled ? undefined : onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: on ? (color || "#A89BFF") : "rgba(232,228,220,0.45)", opacity: disabled ? 0.4 : 1 }}
    >
      <div style={S.chk(on, color)}>{on && ChkSvg}</div>
      <span>{label}</span>
    </label>
  );

  if (!data) return null;

  const descText = incRet && incPerf ? "기본 연봉 + 리텐션/사이닝 + 성과 인센티브 포함" : incRet ? "기본 연봉 + 리텐션/사이닝 인센티브 포함" : incPerf ? "기본 연봉 + 성과 인센티브 포함" : "기본 연봉만 표시";
  const curLabel = TABS.find((t) => t.key === tab)?.label || "";

  return (
    <div style={S.wrap}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
        input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.55);cursor:pointer}
      `}</style>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: BASE, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Featuring</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>연봉 대시보드</h1>
            <div style={{ fontSize: 13, color: "rgba(232,228,220,0.4)", marginTop: 4 }}>
              총 {data.totalCount}명
              {asOfDate && <span style={{ color: opacity(0.7), marginLeft: 8 }}>({asOfDate} 기준 재직자)</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.4)" }}>총 연봉 합계</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{fmt(data.totalSalary)}</div>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginTop: 2 }}>월 {fmt(data.monthlySalary)}</div>
            <button
              onClick={() => setUploadOpen(!uploadOpen)}
              style={{
                marginTop: 10,
                background: uploadOpen ? "rgba(94,81,255,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${uploadOpen ? opacity(0.3) : "rgba(255,255,255,0.08)"}`,
                borderRadius: 6,
                color: uploadOpen ? "#A89BFF" : "rgba(232,228,220,0.4)",
                fontSize: 11,
                padding: "4px 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .15s",
              }}
            >
              데이터 업데이트
            </button>
          </div>
        </div>

        {/* Upload Panel */}
        {uploadOpen && (
          <div style={{ ...S.panel, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 6, paddingLeft: 4 }}>데이터 교체</div>
            <div style={{ fontSize: 12, color: "rgba(232,228,220,0.3)", marginBottom: 16, paddingLeft: 4 }}>연봉 양식 CSV를 업로드하면 기존 데이터가 즉시 교체됩니다.</div>
            <UploadPanel password={password} onSuccess={handleUploadSuccess} />
          </div>
        )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
            {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} style={S.tabBtn(tab === t.key)}>{t.label}</button>)}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <ChkLabel on={incRet} onClick={() => toggle("incRet", incRet)} label="리텐션/사이닝" color="#A89BFF" />
            <ChkLabel on={incPerf} onClick={() => toggle("incPerf", incPerf)} label="'26 1분기 성과" color="#C4B0FF" />
          </div>
        </div>

        {/* Date Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingLeft: 4 }}>
          <span style={{ fontSize: 12, color: "rgba(232,228,220,0.3)" }}>기준일</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => {
              const val = e.target.value;
              setAsOfDate(val);
              refetch({ asOfDate: val });
            }}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${asOfDate ? opacity(0.35) : "rgba(255,255,255,0.08)"}`,
              borderRadius: 6,
              color: asOfDate ? "#E8E4DC" : "rgba(232,228,220,0.3)",
              padding: "5px 10px",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              colorScheme: "dark",
              outline: "none",
            }}
          />
          {asOfDate ? (
            <button
              onClick={() => { setAsOfDate(""); refetch({ asOfDate: "" }); }}
              style={{ background: "none", border: "none", color: "rgba(232,228,220,0.35)", cursor: "pointer", fontSize: 12, padding: "2px 6px", fontFamily: "inherit" }}
            >
              초기화
            </button>
          ) : (
            <span style={{ fontSize: 11, color: "rgba(232,228,220,0.2)" }}>날짜 설정 시 입사일 기준으로 재직자를 필터링합니다</span>
          )}
        </div>

        {fetching && <div style={{ textAlign: "center", padding: 20, color: "rgba(232,228,220,0.4)", fontSize: 13 }}>데이터 갱신 중...</div>}

        {/* Bar Chart */}
        <div style={S.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{curLabel} 연봉</div>
            <div style={{ display: "flex", gap: 12 }}>
              <ChkLabel on={showTotal} onClick={toggleTotal} label="합계" color={BASE} disabled={showTotal && !showAvg} />
              <ChkLabel on={showAvg} onClick={toggleAvg} label="평균" color="#4AC978" disabled={showAvg && !showTotal} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginBottom: 20, paddingLeft: 8 }}>{descText}</div>
          <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 60 + 110)}>
            <ComposedChart data={chartData} layout="horizontal" margin={{ top: 28, right: 20, bottom: 0, left: 20 }} barCategoryGap="28%">
              <XAxis dataKey="name" type="category" tick={<MultiLineTick />} axisLine={false} tickLine={false} interval={0} height={56} scale="band" />
              <YAxis hide domain={[0, yMax * 1.25]} />
              <Tooltip content={<ChartTip showTotal={showTotal} showAvg={showAvg} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              {/* 항상 Bar 렌더링 → band scale 고정. showTotal=false면 dataKey를 'avg'로 전환해 스케일 일치, 색은 투명 처리 */}
              <Bar dataKey={showTotal ? "total" : "avg"} radius={[6, 6, 0, 0]} isAnimationActive={false}
                label={showTotal ? { position: "top", formatter: (v) => fmt(v), fill: "rgba(232,228,220,0.5)", fontSize: 10 } : false}>
                {chartData.map((_, i) => <Cell key={i} fill={showTotal ? colors[i] : "transparent"} />)}
              </Bar>
              {showAvg && (
                <Line type="linear" dataKey="avg" stroke="#4AC978" strokeWidth={2} dot={{ r: 5, fill: "#4AC978", stroke: "rgba(15,18,30,0.8)", strokeWidth: 2 }}
                  label={!showTotal ? { position: "top", formatter: (v) => fmt(v), fill: "#4AC978", fontSize: 10 } : false} />
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
