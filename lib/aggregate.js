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
    else if (h.includes("퇴사일")) cm.leaveDate = i;
    else if (h.includes("임금계약일")) cm.contractDate = i;
    else if (h.includes("이전") && h.includes("계약") && h.includes("금액")) cm.prevSalary = i;
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
      leaveDate: parseDate(g(cm.leaveDate)),
      contractDate: parseDate(g(cm.contractDate)),
      prevSalary: parseMoney(g(cm.prevSalary)),
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

const DEPT_ORDER = ["C-lv", "프로덕트본부", "IB본부", "S&M본부", "경영관리본부"];
const RANK_ORDER = ["팀장", "매니저"];
const CLV_TEAMS = ["CEO", "CTO", "COO", "CFO"];

// 탭별 제외 규칙
// - dept/job: 전체 포함 (C-lv, 이사, CEO/CTO/COO 모두 본부 그룹에 포함)
// - rank: "이사" 직급 그룹 제외
// - team: "CEO/CTO/COO/CFO" 조직 그룹 제외
const TAB_EXCLUDE = {
  rank: (d) => d.rank === "이사",
  team: (d) => CLV_TEAMS.includes(d.team),
};
const TABS = [
  { key: "dept", label: "본부별", field: "dept", order: DEPT_ORDER },
  { key: "team", label: "조직별", field: "team", order: null },
  { key: "rank", label: "직급별", field: "rank", order: RANK_ORDER },
  { key: "job", label: "직무별", field: "job", order: null },
];

/**
 * 특정 (year, month0) 시점의 직원 스냅샷 반환.
 * - 그 달에 재직 중인 직원만 필터 (입사일 ≤ 월말 + 퇴사일 없음 OR ≥ 월초)
 * - 각 직원의 salary 필드를 그 시점의 effectiveSalary로 교체
 * - month0는 0-indexed (Date 객체 규약)
 */
function snapshotAt(rawData, year, month0) {
  const monthStart = new Date(year, month0, 1).getTime();
  const monthEnd = new Date(year, month0 + 1, 0, 23, 59, 59, 999).getTime();

  return rawData
    .filter((d) => {
      const joined = !d.joinDate || d.joinDate <= monthEnd;
      const stillEmployed = !d.leaveDate || d.leaveDate >= monthStart;
      return joined && stillEmployed;
    })
    .map((d) => {
      const cd = d.contractDate || d.joinDate;
      const salary = cd && cd > monthEnd && d.prevSalary > 0 ? d.prevSalary : d.salary;
      return { ...d, salary };
    });
}

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

export function computeAll(rawData, { incRet, incPerf, asOfMonth }) {
  // 전역 필터 없음 — 전체 카운트/합계는 모든 인원 포함 (C-lv, 이사, CEO/CTO/COO 포함)
  let data = rawData;

  // asOfMonth (예: "2026-05") 설정 시: 해당 월에 재직 중인 인원만 필터링
  // 일할계산 없음 - 단 하루라도 그 월에 재직했으면 연봉/12 그대로 포함
  if (asOfMonth) {
    const [year, month] = asOfMonth.split("-").map(Number);
    if (year && month) {
      const monthStart = new Date(year, month - 1, 1).getTime();
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999).getTime();
      data = data.filter((d) => {
        const joined = !d.joinDate || d.joinDate <= monthEnd;
        const stillEmployed = !d.leaveDate || d.leaveDate >= monthStart;
        return joined && stillEmployed;
      });
    }
  }

  const totalCount = data.length;

  // ──────────────────────────────────────────────────────────────
  // 시점별 정확한 연봉 계산 (effectiveSalary)
  // - 조회 시점(queryDate): asOfMonth 있으면 그 달 말일, 없으면 오늘
  // - 임금계약일이 비어있으면 입사일과 동일하게 간주
  // - 임금계약일이 조회 시점보다 미래 + 직전 연봉 있으면 → 직전 연봉 사용
  //   (그 시점엔 아직 새 계약 발효 전)
  // - 그 외 모든 경우 → 현재 연봉(salary) 사용
  // ──────────────────────────────────────────────────────────────
  let referenceDate;
  if (asOfMonth) {
    const [y, m] = asOfMonth.split("-").map(Number);
    referenceDate = new Date(y, m, 0, 23, 59, 59, 999);
  } else {
    referenceDate = new Date();
  }
  const queryDate = referenceDate.getTime();

  const effectiveSalary = (d) => {
    const cd = d.contractDate || d.joinDate; // 임금계약일 비면 입사일로 대체
    if (cd && cd > queryDate && d.prevSalary > 0) {
      return d.prevSalary;
    }
    return d.salary;
  };

  // 모든 후속 집계가 시점별 연봉을 사용하도록 effData로 교체
  data = data.map((d) => ({ ...d, salary: effectiveSalary(d) }));

  // ──────────────────────────────────────────────────────────────
  // 12개월 추이용 월별 스냅샷 사전 계산
  // - referenceDate에서 11개월 전부터 referenceDate까지 12개 포인트
  // - 각 스냅샷은 그 월의 재직자 + 시점별 effectiveSalary 적용
  // ──────────────────────────────────────────────────────────────
  const baseY = referenceDate.getFullYear();
  const baseM = referenceDate.getMonth();
  const monthlySnapshots = [];
  for (let i = 11; i >= 0; i--) {
    const totalMonths = baseY * 12 + baseM - i;
    const y = Math.floor(totalMonths / 12);
    const m0 = ((totalMonths % 12) + 12) % 12; // negative 안전
    monthlySnapshots.push({
      label: `${y}-${String(m0 + 1).padStart(2, "0")}`,
      snapshot: snapshotAt(rawData, y, m0),
    });
  }

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

    // 탭별 제외 규칙: dept/job → 전체, rank → 이사 제외, team → C-lv 임원 제외
    const excludeFn = TAB_EXCLUDE[tab.key];
    const tabData = excludeFn ? data.filter((d) => !excludeFn(d)) : data;
    const tabCount = tabData.filter((d) => {
      const k = d[tab.field];
      return k && k !== "미지정";
    }).length;

    tabData.forEach((d) => {
      const k = d[tab.field];
      // 빈 값 / "미지정" 그룹은 집계에서 제외
      if (!k || k === "미지정") return;

      if (!agg[k]) agg[k] = { name: k, baseSalary: 0, retInc: 0, perfInc: 0, count: 0 };
      agg[k].baseSalary += d.salary;
      agg[k].retInc += d.incRet;
      agg[k].perfInc += d.inc26;
      agg[k].count += 1;

      // 본부별 탭의 분포도: 직급=이사 개인은 제외 (개별 임원 연봉이 분포 양극에 노출되는 것 방지)
      // 막대 차트·표·추이엔 그대로 포함됨
      if (tab.key === "dept" && d.rank === "이사") return;

      if (!groups[k]) groups[k] = [];
      groups[k].push(d.salary + (incRet ? d.incRet : 0) + (incPerf ? d.inc26 : 0));
    });

    let aggArr = Object.values(agg).map((x) => ({
      ...x,
      total: x.baseSalary + (incRet ? x.retInc : 0) + (incPerf ? x.perfInc : 0),
      avg: Math.round((x.baseSalary + (incRet ? x.retInc : 0) + (incPerf ? x.perfInc : 0)) / x.count),
      countPct: tabCount ? +(x.count / tabCount * 100).toFixed(1) : 0,
    }));
    const tabTotalSalary = aggArr.reduce((a, x) => a + x.total, 0);
    aggArr = sortByOrder(aggArr, tab.order, "total");
    aggArr.forEach((x) => {
      x.totalPct = tabTotalSalary ? +(x.total / tabTotalSalary * 100).toFixed(1) : 0;
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

    // 12개월 추이 집계 (탭별 그룹 평균 + 전체 평균)
    const trendArr = monthlySnapshots.map(({ label, snapshot }) => {
      const filteredSnap = excludeFn ? snapshot.filter((d) => !excludeFn(d)) : snapshot;
      const groupSums = {};
      let overallSum = 0;
      let overallCount = 0;
      filteredSnap.forEach((d) => {
        const k = d[tab.field];
        if (!k || k === "미지정") return;
        if (!groupSums[k]) groupSums[k] = { sum: 0, count: 0 };
        groupSums[k].sum += d.salary;
        groupSums[k].count += 1;
        overallSum += d.salary;
        overallCount += 1;
      });
      const entry = {
        month: label,
        _overallAvg: overallCount ? Math.round(overallSum / overallCount) : 0,
      };
      for (const [name, { sum, count }] of Object.entries(groupSums)) {
        entry[name] = Math.round(sum / count);
      }
      return entry;
    });

    tabs[tab.key] = { agg: aggArr, dist: distArr, trend: trendArr };
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
