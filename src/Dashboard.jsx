import { useState, useMemo, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/* ─── Constants ─── */
const BASE = "#5E51FF";
const opacity = (a) => `rgba(94,81,255,${a})`;
const DEPT_ORDER = ["C-lv","프로덕트본부","인플루언서비즈니스본부","세일즈&마케팅본부","경영관리본부"];
const RANK_ORDER = ["이사","팀장","사원"];
const TABS = [
  { key:"dept", label:"본부별", field:"dept", order:DEPT_ORDER },
  { key:"team", label:"조직별", field:"team", order:null },
  { key:"rank", label:"직급별", field:"rank", order:RANK_ORDER },
  { key:"job",  label:"직무별", field:"job",  order:null },
];

/* ─── Helpers ─── */
const fmt = v => `${Math.round(v/1e4).toLocaleString()}만원`;
const fmtFull = v => `${Math.round(v/1e4).toLocaleString()}만원`;
const fmtM = v => `${Math.round(v/1e4).toLocaleString()}`;

function parseMoney(s) {
  if (!s) return 0;
  return parseInt(String(s).replace(/[₩,\s원]/g,""),10) || 0;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length<2) return [];
  const parseLine = line => {
    const parts=[]; let cur="",inQ=false;
    for(const ch of line){ if(ch==='"'){inQ=!inQ} else if(ch===','&&!inQ){parts.push(cur.trim());cur=""} else cur+=ch; }
    parts.push(cur.trim());
    return parts.map(p=>p.replace(/^"|"$/g,"").trim());
  };
  const headers=parseLine(lines[0]);
  const cm={};
  headers.forEach((h,i)=>{
    const c=h.replace(/\s/g,"");
    if(h.includes("사번"))cm.id=i;
    else if(h.includes("이름")&&!h.includes("회사"))cm.name=i;
    else if(h.includes("본부"))cm.dept=i;
    else if(h.includes("조직"))cm.team=i;
    else if(h.includes("직급"))cm.rank=i;
    else if(c.includes("직무")||c.includes("계열"))cm.job=i;
    else if(c.includes("계약금액")||(c.includes("계약")&&c.includes("금액")))cm.salary=i;
    else if(h.includes("리텐션")||h.includes("사이닝"))cm.incRet=i;
    else if(h.includes("성과"))cm.incPerf=i;
  });
  if(cm.salary===undefined) headers.forEach((h,i)=>{ if((h.includes("계약")||h.includes("금액"))&&cm.salary===undefined) cm.salary=i; });
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const p=parseLine(lines[i]); if(p.length<5) continue;
    const g=idx=>(idx!==undefined&&idx<p.length)?p[idx]:"";
    const sal=parseMoney(g(cm.salary)); if(!sal) continue;
    rows.push({ id:g(cm.id)||String(i), name:g(cm.name)||"", dept:g(cm.dept)||"미지정", team:g(cm.team)||"미지정", rank:g(cm.rank)||"미지정", job:g(cm.job)||"미지정", salary:sal, incRet:parseMoney(g(cm.incRet)), inc26:parseMoney(g(cm.incPerf)) });
  }
  return rows;
}

function aggregate(data,key,incR,incP,order){
  const m={};
  data.forEach(d=>{ const k=d[key]||"미지정"; if(!m[k]) m[k]={name:k,baseSalary:0,retInc:0,perfInc:0,count:0}; m[k].baseSalary+=d.salary; m[k].retInc+=d.incRet; m[k].perfInc+=d.inc26; m[k].count+=1; });
  const arr=Object.values(m).map(x=>({...x, total:x.baseSalary+(incR?x.retInc:0)+(incP?x.perfInc:0), avg:Math.round((x.baseSalary+(incR?x.retInc:0)+(incP?x.perfInc:0))/x.count) }));
  if(order) arr.sort((a,b)=>{ const ia=order.indexOf(a.name),ib=order.indexOf(b.name); if(ia!==-1&&ib!==-1) return ia-ib; if(ia!==-1) return -1; if(ib!==-1) return 1; return b.total-a.total; });
  else arr.sort((a,b)=>b.total-a.total);
  return arr;
}

function barColors(n){ return Array.from({length:n},(_,i)=>opacity(1-i*(0.55/Math.max(n-1,1)))); }

/* ─── Tooltip ─── */
const Tip=({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  const d=payload[0].payload;
  return (
    <div style={{background:"rgba(15,18,30,0.96)",border:`1px solid ${opacity(0.25)}`,borderRadius:10,padding:"14px 18px",color:"#E8E4DC",fontSize:13,lineHeight:1.8,backdropFilter:"blur(14px)",maxWidth:300}}>
      <div style={{fontWeight:700,fontSize:15,color:"#fff",marginBottom:2}}>{label}</div>
      <div style={{color:opacity(0.7)}}>인원 <span style={{color:"#fff",fontWeight:600}}>{d.count}명</span></div>
      <div style={{color:opacity(0.7)}}>연봉 합계 <span style={{color:"#fff",fontWeight:600}}>{fmtFull(d.total)}</span></div>
      <div style={{color:opacity(0.7)}}>평균 연봉 <span style={{color:"#fff",fontWeight:600}}>{fmtFull(d.avg)}</span></div>
      {d.retInc>0&&<div style={{color:"#A89BFF"}}>리텐션/사이닝 <span style={{color:"#fff"}}>{fmtFull(d.retInc)}</span></div>}
      {d.perfInc>0&&<div style={{color:"#C4B0FF"}}>성과 인센티브 <span style={{color:"#fff"}}>{fmtFull(d.perfInc)}</span></div>}
    </div>
  );
};

/* ─── HTML Generator ─── */
function generateHTML(data, password) {
  const jsonData = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Featuring 연봉 대시보드</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Noto Sans KR',sans-serif;background:linear-gradient(160deg,#0A0F1C,#111827,#150F20);color:#E8E4DC;min-height:100vh}
.lock{display:flex;align-items:center;justify-content:center;min-height:100vh}
.lock-box{background:rgba(20,22,40,0.9);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:48px 40px;width:360px;text-align:center;backdrop-filter:blur(20px);box-shadow:0 24px 80px rgba(0,0,0,0.5)}
.lock-box .brand{font-size:11px;letter-spacing:4px;color:#5E51FF;text-transform:uppercase;font-weight:600;margin-bottom:8px}
.lock-box h1{font-size:22px;font-weight:800;margin-bottom:6px}
.lock-box .sub{font-size:13px;color:rgba(232,228,220,0.4);margin-bottom:32px}
.lock-box input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#E8E4DC;font-size:14px;outline:none}
.lock-box input.err{border-color:#E85454}
.lock-box .err-msg{color:#E85454;font-size:12px;margin-top:8px}
.lock-box button{margin-top:20px;width:100%;padding:14px;background:linear-gradient(135deg,#5E51FF,#7B6FFF);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer}
.lock-box button:hover{opacity:0.9}
#app{display:none;max-width:960px;margin:0 auto;padding:32px 24px}
.header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;flex-wrap:wrap;gap:16px}
.brand-sm{font-size:11px;letter-spacing:4px;color:#5E51FF;text-transform:uppercase;font-weight:600;margin-bottom:4px}
h1{font-size:28px;font-weight:800;color:#fff}
.meta{font-size:13px;color:rgba(232,228,220,0.4);margin-top:4px}
.total-label{font-size:12px;color:rgba(232,228,220,0.4)}
.total-val{font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 18px}
.card .label{font-size:11px;color:rgba(232,228,220,0.45);margin-bottom:6px}
.card .val{font-size:18px;font-weight:700}
.controls{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.tabs{display:flex;gap:4px;background:rgba(255,255,255,0.04);border-radius:10px;padding:3px}
.tab{padding:9px 18px;border-radius:8px;border:none;background:transparent;color:rgba(232,228,220,0.45);font-size:13px;font-weight:500;cursor:pointer;font-family:inherit}
.tab.on{background:rgba(94,81,255,0.2);color:#A89BFF;font-weight:700}
.checks{display:flex;gap:16px;align-items:center}
.chk{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:rgba(232,228,220,0.45)}
.chk.on{color:#A89BFF}
.chk-box{width:18px;height:18px;border-radius:4px;border:1.5px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s}
.chk.on .chk-box{background:#5E51FF;border:none}
.panel{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:28px 20px 16px}
.panel h2{font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;padding-left:8px}
.panel .desc{font-size:12px;color:rgba(232,228,220,0.35);margin-bottom:20px;padding-left:8px}
.chart-wrap{position:relative;width:100%}
.tbl-wrap{margin-top:20px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:16px;overflow:hidden}
.tbl-head{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:14px;font-weight:700;color:#fff}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:12px 16px;color:rgba(232,228,220,0.4);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.06)}
td{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.03)}
.al{text-align:left}.ar{text-align:right}
.fw{font-weight:600;color:#fff}.dim{color:rgba(232,228,220,0.6)}
.purple{color:#A89BFF}.lpurple{color:#C4B0FF}.white{color:#fff;font-weight:700}
.footer{text-align:center;margin-top:32px;font-size:11px;color:rgba(232,228,220,0.2)}
</style>
</head>
<body>

<div class="lock" id="lockScreen">
<div class="lock-box">
<div class="brand">Featuring</div>
<h1>연봉 대시보드</h1>
<div class="sub">접근 권한이 필요합니다</div>
<div style="position:relative"><input type="password" id="pwInput" placeholder="비밀번호 입력" onkeydown="if(event.key==='Enter')unlock()" oninput="this.value=this.value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\\-=\\[\\]{};':&quot;\\\\|,.<>/?\\x60~]/g,'')"><span onclick="var i=document.getElementById('pwInput');if(i.type==='password'){i.type='text';this.textContent='🙈'}else{i.type='password';this.textContent='👁'}" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:14px;color:rgba(232,228,220,0.4);user-select:none">👁</span></div>

<div class="err-msg" id="errMsg" style="display:none">비밀번호가 일치하지 않습니다</div>
<button onclick="unlock()">접속</button>
</div>
</div>

<div id="app">
<div class="header">
<div><div class="brand-sm">Featuring</div><h1>연봉 대시보드</h1><div class="meta" id="metaText"></div></div>
<div style="text-align:right"><div class="total-label">총 연봉 합계</div><div class="total-val" id="totalVal"></div></div>
</div>
<div class="cards" id="cards"></div>
<div class="controls">
<div class="tabs" id="tabBar"></div>
<div class="checks">
<div class="chk" id="chkRet" onclick="toggleRet()"><div class="chk-box" id="chkRetBox"></div><span>리텐션/사이닝</span></div>
<div class="chk" id="chkPerf" onclick="togglePerf()"><div class="chk-box" id="chkPerfBox"></div><span>'26 1분기 성과</span></div>
</div>
</div>
<div class="panel"><h2 id="chartTitle"></h2><div class="desc" id="chartDesc"></div><div class="chart-wrap"><canvas id="mainChart"></canvas></div></div>
<div class="tbl-wrap"><div class="tbl-head">상세 데이터 <span style="font-weight:400;font-size:12px;color:rgba(232,228,220,0.35)">(단위: 만원)</span></div><div style="overflow-x:auto"><table id="dataTable"></table></div></div>
<div class="footer">Confidential · Featuring Inc. · 의사결정권자 전용</div>
</div>

<script>
const PASS=${JSON.stringify(password)};
const RAW=${jsonData};
const DEPT_ORDER=["C-lv","프로덕트본부","인플루언서비즈니스본부","세일즈&마케팅본부","경영관리본부"];
const RANK_ORDER=["이사","팀장","사원"];
const TABS=[{key:"dept",label:"본부별",field:"dept",order:DEPT_ORDER},{key:"team",label:"조직별",field:"team",order:null},{key:"rank",label:"직급별",field:"rank",order:RANK_ORDER},{key:"job",label:"직무별",field:"job",order:null}];
let curTab="dept",incRet=false,incPerf=false,chart=null;

function unlock(){
  const v=document.getElementById("pwInput").value;
  if(v===PASS){document.getElementById("lockScreen").style.display="none";document.getElementById("app").style.display="block";init()}
  else{document.getElementById("pwInput").classList.add("err");document.getElementById("errMsg").style.display="block"}
}
function init(){buildTabs();render()}
function buildTabs(){
  const bar=document.getElementById("tabBar");bar.innerHTML="";
  TABS.forEach(t=>{const b=document.createElement("button");b.className="tab"+(t.key===curTab?" on":"");b.textContent=t.label;b.onclick=()=>{curTab=t.key;buildTabs();render()};bar.appendChild(b)})
}
function toggleRet(){incRet=!incRet;document.getElementById("chkRet").className="chk"+(incRet?" on":"");document.getElementById("chkRetBox").innerHTML=incRet?'<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>':"";render()}
function togglePerf(){incPerf=!incPerf;document.getElementById("chkPerf").className="chk"+(incPerf?" on":"");document.getElementById("chkPerfBox").innerHTML=incPerf?'<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>':"";render()}
function agg(field,order){
  const m={};RAW.forEach(d=>{const k=d[field]||"미지정";if(!m[k])m[k]={name:k,base:0,ret:0,perf:0,cnt:0};m[k].base+=d.salary;m[k].ret+=d.incRet;m[k].perf+=d.inc26;m[k].cnt++});
  const a=Object.values(m).map(x=>({...x,total:x.base+(incRet?x.ret:0)+(incPerf?x.perf:0),avg:Math.round((x.base+(incRet?x.ret:0)+(incPerf?x.perf:0))/x.cnt)}));
  if(order)a.sort((a,b)=>{const ia=order.indexOf(a.name),ib=order.indexOf(b.name);if(ia>-1&&ib>-1)return ia-ib;if(ia>-1)return-1;if(ib>-1)return 1;return b.total-a.total});
  else a.sort((a,b)=>b.total-a.total);return a
}
function fmtW(v){return Math.round(v/1e4).toLocaleString()+"만원"}
function fmtF(v){return Math.round(v/1e4).toLocaleString()+"만원"}
function fmtM(v){return Math.round(v/1e4).toLocaleString()}
function colors(n){return Array.from({length:n},(_,i)=>"rgba(94,81,255,"+(1-i*(0.55/Math.max(n-1,1)))+")")}
function render(){
  const tab=TABS.find(t=>t.key===curTab);
  const d=agg(tab.field,tab.order);
  let totS=RAW.reduce((a,x)=>a+x.salary,0);if(incRet)totS+=RAW.reduce((a,x)=>a+x.incRet,0);if(incPerf)totS+=RAW.reduce((a,x)=>a+x.inc26,0);
  const totR=RAW.reduce((a,x)=>a+x.incRet,0),totP=RAW.reduce((a,x)=>a+x.inc26,0),totCnt=RAW.length;
  document.getElementById("metaText").textContent="총 "+RAW.length+"명";
  document.getElementById("totalVal").textContent=fmtW(totS);
  document.getElementById("cards").innerHTML=[
    {l:"기본 연봉 총합",v:RAW.reduce((a,x)=>a+x.salary,0),c:"#5E51FF"},
    {l:"리텐션/사이닝 총합",v:totR,c:"#A89BFF"},
    {l:"'26 1분기 성과 총합",v:totP,c:"#C4B0FF"}
  ].map(c=>'<div class="card"><div class="label">'+c.l+'</div><div class="val" style="color:'+c.c+'">'+fmtF(c.v)+'</div></div>').join("");
  document.getElementById("chartTitle").textContent=tab.label+" 연봉 합계";
  const desc=incRet&&incPerf?"기본 연봉 + 리텐션/사이닝 + 성과 인센티브 포함":incRet?"기본 연봉 + 리텐션/사이닝 인센티브 포함":incPerf?"기본 연봉 + 성과 인센티브 포함":"기본 연봉만 표시";
  document.getElementById("chartDesc").textContent=desc;
  const cols=colors(d.length);
  if(chart)chart.destroy();
  const ctx=document.getElementById("mainChart");
  ctx.parentElement.style.height=Math.max(320,d.length*52+40)+"px";
  chart=new Chart(ctx,{type:"bar",data:{labels:d.map(x=>x.name),datasets:[{data:d.map(x=>x.total),backgroundColor:cols,borderRadius:6,barPercentage:0.7}]},
    options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{backgroundColor:"rgba(15,18,30,0.96)",titleColor:"#fff",bodyColor:"#E8E4DC",borderColor:"rgba(94,81,255,0.25)",borderWidth:1,padding:14,titleFont:{size:14,weight:700},bodyFont:{size:13},
        callbacks:{label:function(c){const x=d[c.dataIndex];return["연봉 합계: "+fmtF(x.total),"평균 연봉: "+fmtF(x.avg),"인원: "+x.cnt+"명",...(x.ret>0?["리텐션/사이닝: "+fmtF(x.ret)]:[]),...(x.perf>0?["성과 인센티브: "+fmtF(x.perf)]:[])]}}}},
      scales:{x:{display:false},y:{grid:{display:false},ticks:{color:"rgba(232,228,220,0.7)",font:{size:13,weight:500}}}}}});
  let hdr="<thead><tr><th class='al'>"+tab.label.replace("별","")+"</th><th class='ar'>인원</th><th class='ar'>연봉 합계</th>"+(incRet?"<th class='ar'>리텐션/사이닝</th>":"")+(incPerf?"<th class='ar'>성과</th>":"")+"<th class='ar'>평균</th><th class='ar'>총합</th></tr></thead>";
  let body="<tbody>"+d.map(x=>"<tr><td class='al fw'>"+x.name+"</td><td class='ar dim'>"+x.cnt+"명</td><td class='ar purple'>"+fmtM(x.base)+"</td>"+(incRet?"<td class='ar lpurple'>"+(x.ret>0?fmtM(x.ret):"-")+"</td>":"")+(incPerf?"<td class='ar lpurple'>"+(x.perf>0?fmtM(x.perf):"-")+"</td>":"")+"<td class='ar dim'>"+fmtM(x.avg)+"</td><td class='ar white'>"+fmtM(x.total)+"</td></tr>").join("")+"</tbody>";
  document.getElementById("dataTable").innerHTML=hdr+body
}
<\/script>
</body>
</html>`;
}

/* ─── Main Component ─── */
export default function App() {
  const [data, setData] = useState([]);
  const [tab, setTab] = useState("dept");
  const [incRet, setIncRet] = useState(false);
  const [incPerf, setIncPerf] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const [dlPw, setDlPw] = useState("");
  const [dlPwConfirm, setDlPwConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [hideClv, setHideClv] = useState(false);

  const currentTab = TABS.find(t => t.key === tab);
  const filtered = useMemo(() => hideClv ? data.filter(d => d.dept !== "C-lv") : data, [data, hideClv]);
  const chartData = useMemo(() => filtered.length ? aggregate(filtered, currentTab.field, incRet, incPerf, currentTab.order) : [], [filtered, tab, incRet, incPerf]);
  const colors = useMemo(() => barColors(chartData.length), [chartData.length]);

  const totalSalary = useMemo(() => {
    let s = filtered.reduce((a, d) => a + d.salary, 0);
    if (incRet) s += filtered.reduce((a, d) => a + d.incRet, 0);
    if (incPerf) s += filtered.reduce((a, d) => a + d.inc26, 0);
    return s;
  }, [filtered, incRet, incPerf]);
  const totalRetInc = useMemo(() => filtered.reduce((a, d) => a + d.incRet, 0), [filtered]);
  const totalPerfInc = useMemo(() => filtered.reduce((a, d) => a + d.inc26, 0), [filtered]);
  const totalCount = useMemo(() => filtered.length, [filtered]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      if (!parsed.length) { setUploadMsg({ t: "err", m: "유효한 데이터를 찾을 수 없습니다." }); return; }
      setData(parsed);
      setUploadMsg({ t: "ok", m: `${parsed.length}명 데이터 반영 완료` });
      setTimeout(() => setUploadMsg(null), 3000);
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.type.includes("csv") || f.type === "text/plain")) handleFile(f);
    else setUploadMsg({ t: "err", m: "CSV 파일만 업로드 가능합니다." });
  }, [handleFile]);

  const downloadHTML = () => {
    if (dlPw !== dlPwConfirm || !dlPw) return;
    const html = generateHTML(filtered, dlPw);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "featuring_salary_dashboard.html"; a.click();
    URL.revokeObjectURL(url);
    setShowPwModal(false); setDlPw(""); setDlPwConfirm("");
  };

  /* ─── Styles ─── */
  const S = {
    wrap: { minHeight: "100vh", background: "linear-gradient(160deg,#0A0F1C,#111827,#150F20)", fontFamily: "'Noto Sans KR','Pretendard',sans-serif", color: "#E8E4DC", padding: "32px 24px" },
    mx: { maxWidth: 960, margin: "0 auto" },
    brand: { fontSize: 11, letterSpacing: 4, color: BASE, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 },
    h1: { fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 },
    meta: { fontSize: 13, color: "rgba(232,228,220,0.4)", marginTop: 4 },
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" },
    panel: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, padding: "28px 20px 16px" },
    tabBtn: (on) => ({ padding: "9px 18px", borderRadius: 8, border: "none", background: on ? "rgba(94,81,255,0.2)" : "transparent", color: on ? "#A89BFF" : "rgba(232,228,220,0.45)", fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "inherit" }),
    chk: (on, c) => ({ width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer", border: on ? "none" : "1.5px solid rgba(255,255,255,0.2)", background: on ? c : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }),
  };

  return (
    <div style={S.wrap}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}`}</style>
      <div style={S.mx}>

        {/* Upload Area */}
        <div style={{ ...S.panel, marginBottom: 24, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>CSV 데이터 업로드</div>
              <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginTop: 2 }}>Google Sheets → 파일 → CSV로 다운로드 → 여기에 업로드</div>
            </div>
            {data.length > 0 && (
              <button onClick={() => setShowPwModal(true)} style={{
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#5E51FF,#7B6FFF)", color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 15 }}>↓</span> HTML 다운로드
              </button>
            )}
          </div>
          <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
            onClick={() => document.getElementById("csv-up").click()}
            style={{ border: dragging ? `2px dashed ${BASE}` : "2px dashed rgba(255,255,255,0.08)", borderRadius: 12, padding: "24px 20px", textAlign: "center", background: dragging ? "rgba(94,81,255,0.06)" : "transparent", cursor: "pointer", transition: "all .2s" }}>
            <input id="csv-up" type="file" accept=".csv" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
            <div style={{ fontSize: 26, marginBottom: 6, opacity: 0.4 }}>📄</div>
            <div style={{ fontSize: 13, color: "rgba(232,228,220,0.55)", fontWeight: 500 }}>CSV 파일을 드래그하거나 클릭하여 업로드</div>
          </div>
          {uploadMsg && (
            <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, fontSize: 13, background: uploadMsg.t === "ok" ? "rgba(94,81,255,0.1)" : "rgba(232,84,84,0.1)", color: uploadMsg.t === "ok" ? "#A89BFF" : "#E85454" }}>{uploadMsg.m}</div>
          )}
        </div>

        {data.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", opacity: 0.4 }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>CSV 파일을 업로드하면 대시보드가 표시됩니다</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={S.brand}>Featuring</div>
                <h1 style={S.h1}>연봉 대시보드</h1>
                <div style={S.meta}>총 {data.length}명</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "rgba(232,228,220,0.4)" }}>총 연봉 합계</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>{fmt(totalSalary)}</div>
              </div>
            </div>

            {/* Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 28 }}>
              {[
                { l: "기본 연봉 총합", v: filtered.reduce((a, d) => a + d.salary, 0), c: BASE },
                { l: "리텐션/사이닝 총합", v: totalRetInc, c: "#A89BFF" },
                { l: "'26 1분기 성과 총합", v: totalPerfInc, c: "#C4B0FF" },
              ].map((c, i) => (
                <div key={i} style={S.card}>
                  <div style={{ fontSize: 11, color: "rgba(232,228,220,0.45)", marginBottom: 6 }}>{c.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c.c }}>{fmtFull(c.v)}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
                {TABS.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={S.tabBtn(tab === t.key)}>{t.label}</button>)}
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {[
                  { v: incRet, set: () => setIncRet(!incRet), l: "리텐션/사이닝", c: "#A89BFF" },
                  { v: incPerf, set: () => setIncPerf(!incPerf), l: "'26 1분기 성과", c: "#C4B0FF" },
                ].map((c, i) => (
  <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: c.v ? c.c : "rgba(232,228,220,0.45)" }}>
    <div onClick={c.set} style={S.chk(c.v, BASE)}>
      {c.v && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </div>
    <span>{c.l}</span>
  </label>
))}
<label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: hideClv ? "#E85454" : "rgba(232,228,220,0.45)", marginLeft: 8 }}>
  <div onClick={() => setHideClv(!hideClv)} style={S.chk(hideClv, "#E85454")}>
    {hideClv && <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
  </div>
  <span>C-lv 제외</span>
</label>
              </div>
            </div>

            {/* Chart */}
            <div style={S.panel}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4, paddingLeft: 8 }}>{currentTab.label} 연봉 합계</div>
              <div style={{ fontSize: 12, color: "rgba(232,228,220,0.35)", marginBottom: 20, paddingLeft: 8 }}>
                {incRet && incPerf ? "기본 연봉 + 리텐션/사이닝 + 성과 인센티브 포함" : incRet ? "기본 연봉 + 리텐션/사이닝 인센티브 포함" : incPerf ? "기본 연봉 + 성과 인센티브 포함" : "기본 연봉만 표시"}
              </div>
              <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 52 + 40)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 8 }} barCategoryGap="28%">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fill: "rgba(232,228,220,0.7)", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: v => fmt(v), fill: "rgba(232,228,220,0.5)", fontSize: 12, fontWeight: 500 }}>
                    {chartData.map((_, i) => <Cell key={i} fill={colors[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Table */}
            <div style={{ marginTop: 20, ...S.panel, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>상세 데이터</span>
                <span style={{ fontSize: 12, color: "rgba(232,228,220,0.35)" }}>(단위: 만원)</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {[currentTab.label.replace("별", ""), "인원", "인원 비율", "연봉 합계", "연봉 비율", ...(incRet ? ["리텐션/사이닝"] : []), ...(incPerf ? ["성과"] : []), "평균", "총합"].map((h, i) => (
                        <th key={i} style={{ padding: "12px 16px", textAlign: i === 0 ? "left" : "right", color: "rgba(232,228,220,0.4)", fontWeight: 600, fontSize: 11, letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((d, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#fff" }}>{d.name}</td>
                         <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.6)" }}>{d.count}명</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.4)" }}>{totalCount ? (d.count/totalCount*100).toFixed(1) : 0}%</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "#A89BFF" }}>{fmtM(d.baseSalary)}</td>
                        <td style={{ padding: "12px 16px", textAlign: "right", color: "rgba(232,228,220,0.4)" }}>{totalSalary ? (d.total/totalSalary*100).toFixed(1) : 0}%</td>
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
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "rgba(232,228,220,0.2)" }}>Featuring · 연봉 대시보드 생성기</div>
      </div>

      {/* Password Modal */}
      {showPwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(6px)" }} onClick={() => setShowPwModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "rgba(20,22,40,0.95)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "36px 32px", width: 380,
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4 }}>HTML 다운로드</div>
            <div style={{ fontSize: 13, color: "rgba(232,228,220,0.4)", marginBottom: 24 }}>대시보드에 적용할 비밀번호를 설정하세요</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(232,228,220,0.5)", marginBottom: 6 }}>비밀번호</div>
             <div style={{ position: "relative" }}>
  <input type={showPw ? "text" : "password"} value={dlPw} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/g, ""); setDlPw(v); }} placeholder="영문/숫자/특수문자만 입력"
    style={{ width: "100%", padding: "12px 40px 12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E8E4DC", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
  <span onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 14, color: "rgba(232,228,220,0.4)", userSelect: "none" }}>{showPw ? "🙈" : "👁"}</span>
</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "rgba(232,228,220,0.5)", marginBottom: 6 }}>비밀번호 확인</div>
              <div style={{ position: "relative" }}>
  <input type={showPwConfirm ? "text" : "password"} value={dlPwConfirm} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/g, ""); setDlPwConfirm(v); }} placeholder="비밀번호 재입력"
    onKeyDown={e => e.key === "Enter" && dlPw && dlPw === dlPwConfirm && downloadHTML()}
    style={{ width: "100%", padding: "12px 40px 12px 14px", background: "rgba(255,255,255,0.04)", border: `1px solid ${dlPwConfirm && dlPw !== dlPwConfirm ? "#E85454" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: "#E8E4DC", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
  <span onClick={() => setShowPwConfirm(!showPwConfirm)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", cursor: "pointer", fontSize: 14, color: "rgba(232,228,220,0.4)", userSelect: "none" }}>{showPwConfirm ? "🙈" : "👁"}</span>
</div>
              {dlPwConfirm && dlPw !== dlPwConfirm && <div style={{ color: "#E85454", fontSize: 12, marginTop: 6 }}>비밀번호가 일치하지 않습니다</div>}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPwModal(false)} style={{ flex: 1, padding: "12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(232,228,220,0.6)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={downloadHTML} disabled={!dlPw || dlPw !== dlPwConfirm}
                style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: dlPw && dlPw === dlPwConfirm ? "linear-gradient(135deg,#5E51FF,#7B6FFF)" : "rgba(255,255,255,0.05)", color: dlPw && dlPw === dlPwConfirm ? "#fff" : "rgba(232,228,220,0.3)", fontSize: 13, fontWeight: 700, cursor: dlPw && dlPw === dlPwConfirm ? "pointer" : "default" }}>다운로드</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
