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
    // "이전 계약금액"이 "계약금액" 매칭에 잡히지 않도록 먼저 처리
    else if (h.includes("이전") && h.includes("계약") && h.includes("금액")) cm.prevSalary = i;
    else if (c.includes("계약금액") || (c.includes("계약") && c.includes("금액"))) cm.salary = i;
    else if (h.includes("리텐션") || h.includes("사이닝")) cm.incRet = i;
    else if (h.includes("성과")) cm.incPerf = i;
    else if (h.includes("입사일")) cm.joinDate = i;
    else if (h.includes("퇴사일")) cm.leaveDate = i;
    else if (h.includes("임금계약일")) cm.contractDate = i;
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

export function computeAll(rawData, { incRet, incPerf, asOfMonth, raisePeriodMonths = 12 }) {
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
  // 인상률 계산용 과거 스냅샷 (raisePeriodMonths 개월 전)
  // - 룰 1: 임금계약일 == 입사일 인 인원은 인상 이력 없음 → 제외
  // - 룰 2: 직급=이사 인 인원은 인상 추이에서 제외
  // ──────────────────────────────────────────────────────────────
  const pastDate = new Date(referenceDate);
  pastDate.setMonth(pastDate.getMonth() - raisePeriodMonths);
  const pastSnapAll = snapshotAt(rawData, pastDate.getFullYear(), pastDate.getMonth());
  // 인상 추이 자격 조건: 직전 계약 존재 + 이사 아님
  const hasPriorContract = (d) =>
    d.contractDate && d.joinDate && d.contractDate !== d.joinDate && d.prevSalary > 0;
  const raiseEligible = (d) => d.rank !== "이사" && hasPriorContract(d);
  const currentRaiseSet = data.filter(raiseEligible);
  const pastRaiseSet = pastSnapAll.filter(raiseEligible);

  // 전사 평균 인상률
  const currAvgAll = currentRaiseSet.length
    ? currentRaiseSet.reduce((a, d) => a + d.salary, 0) / currentRaiseSet.length
    : 0;
  const pastAvgAll = pastRaiseSet.length
    ? pastRaiseSet.reduce((a, d) => a + d.salary, 0) / pastRaiseSet.length
    : 0;
  const companyRaiseRate = pastAvgAll > 0
    ? +((currAvgAll - pastAvgAll) / pastAvgAll * 100).toFixed(1)
    : 0;

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

      if (!agg[k]) agg[k] = {
        name: k,
        baseSalary: 0, retInc: 0, perfInc: 0, count: 0,
        baseSalaryAvg: 0, retIncAvg: 0, perfIncAvg: 0, countAvg: 0, // 이사 제외 평균 계산용
      };
      // 합계용 (이사 포함)
      agg[k].baseSalary += d.salary;
      agg[k].retInc += d.incRet;
      agg[k].perfInc += d.inc26;
      agg[k].count += 1;
      // 평균용 (이사 제외 — 룰 2)
      if (d.rank !== "이사") {
        agg[k].baseSalaryAvg += d.salary;
        agg[k].retIncAvg += d.incRet;
        agg[k].perfIncAvg += d.inc26;
        agg[k].countAvg += 1;
      }

      // 분포도: 직급=이사 개인 제외 (룰 2)
      if (d.rank === "이사") return;

      if (!groups[k]) groups[k] = [];
      groups[k].push(d.salary + (incRet ? d.incRet : 0) + (incPerf ? d.inc26 : 0));
    });

    let aggArr = Object.values(agg).map((x) => {
      const avgBase = x.baseSalaryAvg + (incRet ? x.retIncAvg : 0) + (incPerf ? x.perfIncAvg : 0);
      return {
        ...x,
        total: x.baseSalary + (incRet ? x.retInc : 0) + (incPerf ? x.perfInc : 0),
        avg: x.countAvg ? Math.round(avgBase / x.countAvg) : 0,
        countPct: tabCount ? +(x.count / tabCount * 100).toFixed(1) : 0,
      };
    });
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

    // 인상률 집계 (그룹별, 이사 제외 + 직전 계약 있는 자만)
    const pastTabSet = excludeFn ? pastRaiseSet.filter((d) => !excludeFn(d)) : pastRaiseSet;
    const currentTabSet = excludeFn ? currentRaiseSet.filter((d) => !excludeFn(d)) : currentRaiseSet;
    const pastGroupAvg = {};
    pastTabSet.forEach((d) => {
      const k = d[tab.field];
      if (!k || k === "미지정") return;
      if (!pastGroupAvg[k]) pastGroupAvg[k] = { sum: 0, count: 0 };
      pastGroupAvg[k].sum += d.salary;
      pastGroupAvg[k].count += 1;
    });
    const currentGroupAvg = {};
    currentTabSet.forEach((d) => {
      const k = d[tab.field];
      if (!k || k === "미지정") return;
      if (!currentGroupAvg[k]) currentGroupAvg[k] = { sum: 0, count: 0 };
      currentGroupAvg[k].sum += d.salary;
      currentGroupAvg[k].count += 1;
    });
    // agg에 있는 그룹 기준으로 raiseRates 생성 (인상 자격자 0명 그룹은 0% 표시)
    const raiseRates = aggArr.map((x) => {
      const cur = currentGroupAvg[x.name];
      const past = pastGroupAvg[x.name];
      const curAvg = cur?.count ? cur.sum / cur.count : 0;
      const pastAvg = past?.count ? past.sum / past.count : 0;
      const ratePct = pastAvg > 0
        ? +((curAvg - pastAvg) / pastAvg * 100).toFixed(1)
        : 0;
      return {
        name: x.name,
        ratePct,
        currentAvg: Math.round(curAvg),
        pastAvg: Math.round(pastAvg),
        count: cur?.count || 0,
      };
    });
    raiseRates.sort((a, b) => b.ratePct - a.ratePct);

    tabs[tab.key] = { agg: aggArr, dist: distArr, raiseRates };
  }

  return {
    totalCount,
    totalSalary,
    totalRetInc,
    totalPerfInc,
    baseSalaryTotal,
    monthlySalary: Math.round(totalSalary / 12),
    companyRaiseRate,
    raisePeriodMonths,
    tabs,
  };
}
