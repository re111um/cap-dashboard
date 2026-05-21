export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const parts = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { parts.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    parts.push(cur.trim());
    return parts.map((p) => p.replace(/^"|"$/g, "").trim());
  };
  const headers = parseLine(lines[0]);
  const cm = {};
  headers.forEach((h, i) => {
    const c = h.replace(/\s/g, "");
    if (h.includes("사번")) cm.id = i;
    else if (h.includes("이름") && !h.includes("회사") && !h.includes("사내")) cm.name = i;
    else if (h.includes("본부")) cm.dept = i;
    else if (h.includes("조직")) cm.team = i;
    else if (h.includes("직급")) cm.rank = i;
    else if (c.includes("직무") || c.includes("계열")) cm.job = i;
    else if (c.includes("계약금액") || (c.includes("계약") && c.includes("금액"))) cm.salary = i;
    else if (h.includes("리텐션") || h.includes("사이닝")) cm.incRet = i;
    else if (h.includes("성과")) cm.incPerf = i;
    else if (h.includes("입사일")) cm.joinDate = i;
  });
  if (cm.salary === undefined)
    headers.forEach((h, i) => {
      if ((h.includes("계약") || h.includes("금액")) && cm.salary === undefined) cm.salary = i;
    });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const p = parseLine(lines[i]);
    if (p.length < 5) continue;
    const g = (idx) => (idx !== undefined && idx < p.length ? p[idx] : "");
    const sal = parseMoney(g(cm.salary));
    if (!sal) continue;
    rows.push({
      dept: g(cm.dept) || "미지정",
      team: g(cm.team) || "미지정",
      rank: g(cm.rank) || "미지정",
      job: g(cm.job) || "미지정",
      salary: sal,
      incRet: parseMoney(g(cm.incRet)),
      inc26: parseMoney(g(cm.incPerf)),
      joinDate: parseDate(g(cm.joinDate)),
    });
  }
  return rows;
}

function parseDate(s) {
  if (!s) return null;
  const clean = s
    .replace(/년\s*/g, "-")
    .replace(/월\s*/g, "-")
    .replace(/일/g, "")
    .replace(/\//g, "-")
    .trim();
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function parseMoney(s) {
  if (!s) return 0;
  return parseInt(String(s).replace(/[₩,\s원]/g, ""), 10) || 0;
}

const DEPT_ORDER = ["프로덕트본부", "IB본부", "S&M본부", "경영관리본부"];
const RANK_ORDER = ["팀장", "매니저"];
const CLV_TEAMS = ["CEO", "CTO", "COO", "CFO"];

function isExcluded(d) {
  // C-lv 임원(조직=CEO/CTO/COO/CFO) 및 이사 직급 전역 제외
  return CLV_TEAMS.includes(d.team) || d.rank === "이사" || d.dept === "C-lv";
}
const TABS = [
  { key: "dept", label: "본부별", field: "dept", order: DEPT_ORDER },
  { key: "team", label: "조직별", field: "team", order: null },
  { key: "rank", label: "직급별", field: "rank", order: RANK_ORDER },
  { key: "job", label: "직무별", field: "job", order: null },
];

function sortByOrder(arr, order, sortKey = "total") {
  if (order) {
    arr.sort((a, b) => {
      const ia = order.indexOf(a.name), ib = order.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b[sortKey] - a[sortKey];
    });
  } else {
    arr.sort((a, b) => b[sortKey] - a[sortKey]);
  }
  return arr;
}

export function computeAll(rawData, { incRet, incPerf, asOfDate }) {
  // 이사·C-lv 임원 전역 제외
  let data = rawData.filter((d) => !isExcluded(d));

  if (asOfDate) {
    const ts = new Date(asOfDate).getTime();
    if (!isNaN(ts)) {
      data = data.filter((d) => !d.joinDate || d.joinDate <= ts);
    }
  }

  const totalCount = data.length;

  let totalSalary = data.reduce((a, d) => a + d.salary, 0);
  if (incRet) totalSalary += data.reduce((a, d) => a + d.incRet, 0);
  if (incPerf) totalSalary += data.reduce((a, d) => a + d.inc26, 0);

  const totalRetInc = data.reduce((a, d) => a + d.incRet, 0);
  const totalPerfInc = data.reduce((a, d) => a + d.inc26, 0);
  const baseSalaryTotal = data.reduce((a, d) => a + d.salary, 0);

  const tabs = {};
  for (const tab of TABS) {
    const agg = {};
    const groups = {};

    data.forEach((d) => {
      const k = d[tab.field];
      // 빈 값 / "미지정" 그룹은 집계에서 제외
      if (!k || k === "미지정") return;

      if (!agg[k]) agg[k] = { name: k, baseSalary: 0, retInc: 0, perfInc: 0, count: 0 };
      agg[k].baseSalary += d.salary;
      agg[k].retInc += d.incRet;
      agg[k].perfInc += d.inc26;
      agg[k].count += 1;

      if (!groups[k]) groups[k] = [];
      groups[k].push(d.salary + (incRet ? d.incRet : 0) + (incPerf ? d.inc26 : 0));
    });

    let aggArr = Object.values(agg).map((x) => ({
      ...x,
      total: x.baseSalary + (incRet ? x.retInc : 0) + (incPerf ? x.perfInc : 0),
      avg: Math.round((x.baseSalary + (incRet ? x.retInc : 0) + (incPerf ? x.perfInc : 0)) / x.count),
      countPct: totalCount ? +(x.count / totalCount * 100).toFixed(1) : 0,
    }));
    aggArr = sortByOrder(aggArr, tab.order, "total");
    aggArr.forEach((x) => {
      x.totalPct = totalSalary ? +(x.total / totalSalary * 100).toFixed(1) : 0;
      x.monthly = Math.round(x.total / 12);
    });

    let distArr = Object.entries(groups).map(([name, vals]) => {
      vals.sort((a, b) => a - b);
      const len = vals.length;
      const mid = Math.floor(len / 2);
      const median = len % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
      return { name, min: vals[0], median, max: vals[len - 1], count: len };
    });
    distArr = sortByOrder(distArr, tab.order, "median");

    tabs[tab.key] = { agg: aggArr, dist: distArr };
  }

  return {
    totalCount,
    totalSalary,
    totalRetInc,
    totalPerfInc,
    baseSalaryTotal,
    monthlySalary: Math.round(totalSalary / 12),
    tabs,
  };
}
