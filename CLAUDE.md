# CLAUDE.md — cap-dashboard 인수인계 문서

> 이 프로젝트의 새 작업을 시작할 때 가장 먼저 읽어야 하는 문서입니다.
> 아키텍처, 비즈니스 룰, 설계 결정의 *이유*, 운영 방식, 그리고 과거에 겪었던 실수까지 정리되어 있습니다.

---

## 1. 한 줄 요약

(주)피처링의 **의사결정권자(C-level) 전용 연봉 대시보드**.
Google Drive의 CSV를 자동으로 가져와 비밀번호 인증 후 **집계 통계만** 화면에 표시한다.
원본 CSV·개별 직원 연봉은 브라우저로 절대 전달되지 않는다.

---

## 2. 작업 컨텍스트

- **의뢰자**: 피처링 HR (비개발자). GitHub/Vercel 배포 흐름은 익숙. JS/React 세부는 익숙하지 않음.
- **목적**: 의사결정권자가 어디 기기에서든 동일한 최신 데이터를 의뢰자 도움 없이 확인
- **데이터 갱신 책임**: 의뢰자가 Drive 폴더의 CSV 파일을 직접 교체. 코드 배포 불필요.

### 의뢰자 협업 스타일
- 한국어로 응답 (코드 주석도 한국어 OK)
- 변경 사항이 여러 개일 때는 한 번에 적용하지 말고 단계별로 검증·논의
- 차트/UI 변경은 스크린샷으로 캡처해서 비교 요청하는 경우 많음
- "기획과 매칭되지 않은 부분 QA → 보고 → 얼라인 → 수정" 흐름 선호
- 추측하지 말고 모호한 부분은 질문할 것

---

## 3. 기술 스택

| 항목 | 버전/세부 |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19 |
| Chart | Recharts 2 |
| Cache/Storage | Vercel KV (Upstash Redis) |
| Cloud Sync | Google Drive API (`googleapis` + Service Account) |
| Encryption | AES-256-GCM (`crypto` 내장 모듈) |
| Deploy | Vercel |

---

## 4. 디렉터리 구조

```
cap-dashboard/
├── app/
│   ├── layout.jsx              Root layout (Noto Sans KR 폰트)
│   ├── page.jsx                로그인 페이지 (비밀번호 입력)
│   └── api/
│       └── dashboard/
│           └── route.js        유일한 API 엔드포인트. POST. 로드+집계
├── components/
│   └── DashboardView.jsx       메인 대시보드 (단일 컴포넌트 파일)
├── lib/
│   ├── aggregate.js            CSV 파싱 + 집계 로직
│   ├── crypto.js               AES-256-GCM encrypt/decrypt
│   └── drive.js                Google Drive 연동 (Service Account 인증 + CSV fetch)
├── scripts/
│   └── encrypt.js              로컬에서 CSV → encrypted.json 변환 CLI (구버전 보조용)
├── data/
│   └── encrypted.json          최종 fallback용 암호화 데이터 (Drive 장애 대비)
└── CLAUDE.md                   이 문서
```

**중요**: 과거에 있었던 `/api/upload`, `components/UploadPanel`, `cap_encrypted` KV 키는 모두 **제거됨**. Drive를 단일 데이터 소스로 단순화함 (A안 적용).

---

## 5. 환경변수 (Vercel)

| 키 | 용도 | 비고 |
|---|---|---|
| `DASHBOARD_PASSWORD` | 대시보드 로그인용 단일 비밀번호 | 평문 비교 |
| `ENCRYPTION_KEY` | AES-256-GCM 키. SHA256 해시되어 사용 | 어떤 길이여도 OK이나 32자 권장 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Drive Service Account JSON. **JSON 원문 또는 base64 인코딩 양쪽 지원** | `loadCredentials()`가 자동 분기 |
| `GOOGLE_DRIVE_FOLDER_ID` | CSV가 있는 Drive 폴더 ID | 폴더는 Service Account 이메일과 공유돼야 함 |
| `GOOGLE_DRIVE_FILENAME` | 가져올 파일명 (선택) | 기본값 `latest.csv` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV 연결 | Vercel KV/Upstash 통합 시 자동 주입 |

### Service Account JSON 입력 시 주의
- Vercel UI에 JSON 원문 paste 시 `private_key`의 `\n`이 손상되는 경우 다수 발생함
- 그래서 코드에서 `\\n` → `\n` 정규화 + base64 자동 디코딩 지원 추가됨 (`lib/drive.js`의 `loadCredentials()`)
- 문제가 생기면 **base64 인코딩으로 입력 권장** (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("path.json"))`)

---

## 6. 데이터 흐름

```
[Google Drive: latest.csv (평문)]
        ↓ Service Account 인증 (Drive API)
[Vercel 함수: 메모리]
        ↓ AES-256-GCM 재암호화
[Vercel KV: cap_encrypted_cache (5분 TTL)]
        ↓ 복호화 → 파싱 → 집계
[브라우저: 집계 통계만 수신]
```

### `app/api/dashboard/route.js`의 우선순위

1. **KV 캐시 조회** (5분 TTL) — `force=true`면 skip
2. **Drive에서 CSV fetch** → 재암호화 → KV 캐싱
3. **로컬 `data/encrypted.json` 파일** — Drive 장애 시 최종 fallback

```js
const CACHE_TTL_SEC = 300; // 5분. 조정하려면 이 값만 바꾸면 됨.
```

### "↻ 새로고침" 버튼
- 프론트에서 `refetch({ force: true })` 호출 → API body의 `force: true` 전달
- 백엔드는 캐시 무시하고 Drive로 직행 → 의사결정권자가 즉시 반영 원할 때 사용

---

## 7. CSV 데이터 모델

### 컬럼 자동 매핑 (`lib/aggregate.js`의 `parseCSV`)

| 내부 필드 | CSV 헤더 키워드 매칭 |
|---|---|
| `id` | "사번" |
| `name` | "이름" (단 "회사이름", "사내이름" 제외) |
| `dept` | "본부" |
| `team` | "조직" |
| `rank` | "직급" |
| `job` | "직무" 또는 "계열" |
| `salary` | "계약금액" (또는 "계약" + "금액") |
| `incRet` | "리텐션" 또는 "사이닝" |
| `incPerf` | "성과" |
| `joinDate` | "입사일" |
| `leaveDate` | "퇴사일" |
| `contractDate` | "임금계약일" |
| `prevSalary` | "이전" + "계약" + "금액" (모두 포함) |

빈 값은 `"미지정"`으로 채워짐 → 집계에서 자동 스킵.

> ⚠ 과거 CSV의 `근무기간` 컬럼은 사용하지 않음 (자동 계산되지 않으며 무시됨). 의뢰자가 CSV 양식에서 제거 예정.

### 인코딩 처리
- UTF-8 시도 → 한글 키워드("본부", "계약") 없으면 EUC-KR로 재디코딩
- 서버(`lib/drive.js`)에서 처리

### 금액 파싱 (`parseMoney`)
- 원화 기호, 콤마, "원", 공백 모두 제거 후 `parseInt`
- 단위: 원(KRW). 화면 표시 시에만 `/1e4`해서 만원으로 변환 (`fmt`, `fmtM` 헬퍼)

### 날짜 파싱 (`parseDate`)
- "2025-01-06", "2025/01/06", "2025년 1월 6일" 등 자동 인식
- `joinDate`, `leaveDate` 모두 epoch ms로 저장됨 (없으면 `null`)

---

## 8. 비즈니스 룰

### 8.1. 탭별 필터링 (의뢰자 결정사항)
- **전체 인원/총 연봉 합계**: C-lv, 이사, CEO/CTO/COO/CFO **모두 포함**
- **본부별(dept) 탭**: 전체 포함 (C-lv 그룹도 보임)
- **조직별(team) 탭**: CEO/CTO/COO/CFO 그룹 제외
- **직급별(rank) 탭**: 이사 그룹 제외
- **직무별(job) 탭**: 전체 포함

### 8.2. 코드 위치 (`lib/aggregate.js`)
```js
const CLV_TEAMS = ["CEO", "CTO", "COO", "CFO"];
const TAB_EXCLUDE = {
  rank: (d) => d.rank === "이사",
  team: (d) => CLV_TEAMS.includes(d.team),
};
```

### 8.3. "미지정" 처리
- 각 탭 집계에서 `d[tab.field] === "미지정"`인 그룹은 자동 스킵
- 한 직원이 어느 한 필드만 "미지정"이면 그 탭에서만 안 보이고 다른 탭에서는 정상 집계됨

### 8.4. 정렬 순서 (`DEPT_ORDER`, `RANK_ORDER`)
- `DEPT_ORDER = ["C-lv", "프로덕트본부", "IB본부", "S&M본부", "경영관리본부"]`
- `RANK_ORDER = ["팀장", "매니저"]` (이사는 제외 대상이므로 제외됨)
- CSV의 실제 본부명과 정확히 일치해야 정렬됨. CSV가 바뀌면 이 배열도 업데이트 필요.

### 8.5. 비율 계산
- `countPct`, `totalPct`는 **탭 로컬 카운트/합계 기준**으로 계산됨 (각 탭에서 합이 100%가 되도록)
- 전역 `totalCount`/`totalSalary`는 헤더 표시용으로만 사용

### 8.6. 월별 추이 (`asOfMonth`) — ⭐ 신규
**의뢰자 결정사항 (확정됨)**:
- 페이지 진입 시 **현재 월 자동 선택** (예: 2026-05)
- 월 네비게이션 `[◀] [▶]` 으로 좌우 이동
- "전체 보기" 버튼으로 필터 해제 → 전체 재직자 + 연 단위 표시 모드로 전환
- 미래 월도 무제한 탐색 가능

**필터 로직** (`computeAll`):
```
joined = !joinDate || joinDate <= 해당월말일
stillEmployed = !leaveDate || leaveDate >= 해당월1일
→ joined && stillEmployed 인 인원만 포함
```

**일할계산 없음**: 그 월 단 하루라도 재직했으면 `계약금액 ÷ 12` 풀 적용 (의뢰자 명시 결정)

**chartUnit과의 관계** (확정 — Q1 A안):
- `asOfMonth`가 설정되면 → 자동으로 `effectiveChartUnit = "month"`
- 차트 헤더의 `[연 | 월]` 토글은 숨겨짐
- "전체 보기" 클릭 → 토글 복원 + 사용자가 마지막 선택한 단위(`chartUnit`)로 복귀
- 코드: `const effectiveChartUnit = asOfMonth ? "month" : chartUnit;`

---

## 9. 차트 구현 핵심 결정사항

`components/DashboardView.jsx`. **수정 전 반드시 이 섹션 읽기**.

### 9.1. 세로 막대 + 직선 꺾은선 (`ComposedChart layout="horizontal"`)
- `Bar` = 합계, `Line type="linear"` = 평균
- 의뢰자는 평균을 **곡선이 아닌 직선 꺾은선**으로 원함 (확정됨)

### 9.2. "항상 Bar 렌더링" 패턴 — 중요!
```jsx
<Bar dataKey={showTotal ? "total" : "avg"} ...>
  {scaledChartData.map((_, i) => <Cell key={i} fill={showTotal ? colors[i] : "transparent"} />)}
</Bar>
```

**이유**: Recharts `ComposedChart`에서 Bar 없이 Line만 있으면 `scale="band"` 명시에도 불구하고 `scale="point"`로 동작 → 첫/끝 데이터 포인트가 plot 영역 양 끝으로 밀려나 잘림.

**해결**: Bar를 항상 렌더링하되,
- `showTotal=false`일 때는 `dataKey`를 `"avg"`로 전환 (Line과 같은 데이터 → 스케일 일치)
- Cell의 `fill`을 `transparent`로 → 시각적으로는 안 보임

**과거 실수 기록**: 처음에 Bar의 dataKey를 항상 `"total"`로 두니, 평균만 표시 모드에서 total의 큰 값(예: 5억)이 도메인 자동 확장을 일으켜 평균선(예: 5천만원)이 차트 바닥에 압축돼 보이는 문제 발생. 위 패턴이 정확한 해결.

### 9.3. `MultiLineTick` 커스텀 컴포넌트
- 긴 한국어 본부/팀명을 자동 줄바꿈
- 5자 초과 + "본부"/"팀"/"그룹"으로 끝나면 접미사 앞에서 분할
- 그 외는 중간 분할

### 9.4. X축 정렬 함정
- `padding={{ left: 0, right: 0 }}`을 명시하면 막대-레이블이 어긋남 — **명시하지 말 것**
- `type="category"`, `scale="band"`도 명시하지 말 것 — Recharts 기본값에 위임
- ComposedChart에 Bar가 있으면 자동으로 band scale 사용됨

### 9.5. 차트 단위 (`effectiveChartUnit`)
- `chartUnit` state ('year' | 'month') + `asOfMonth` 활성 시 자동 'month' 강제 → `effectiveChartUnit` 계산값 사용
- 스케일링은 `scaledChartData`, `scaledDistData` useMemo에서 `effectiveChartUnit === "month"`일 때 `/12` 처리
- 막대 차트 + 분포도 차트만 토글 영향. 헤더/카드/표는 그대로 (표는 이미 "연봉 합계", "월급 합계" 두 컬럼 모두 표시)
- 헤더 우측 영역도 asOfMonth 활성 시 "X년 Y월 월급 합계 / 연 환산 ZZ만원"으로 자동 전환

### 9.6. 분포도 (Range Chart)
- 커스텀 컴포넌트 (Recharts가 아닌 순수 div). `min`/`median`/`max` 동그라미 3개 + 연결선
- 색상: 최저 `#E85454` (빨), 중간값 `#4AC978` (초), 최고 `#5E51FF` (보)

### 9.7. 색상 팔레트 (고정)
| 용도 | 색 |
|---|---|
| Primary (보라) | `#5E51FF` |
| 평균/중간값 (초록) | `#4AC978` |
| 최저/경고 (빨강) | `#E85454` |
| 텍스트 (베이지) | `#E8E4DC` |
| 인센티브 보조색 | `#A89BFF`, `#C4B0FF` |
| 다크 BG | `linear-gradient(160deg,#0A0F1C,#111827,#150F20)` |

---

## 10. 보안 모델

### 보장되는 것
- 개별 직원의 연봉/이름/사번은 **브라우저에 절대 도달하지 않음**
- 서버 메모리에서만 raw 데이터 존재, 응답은 집계 통계만
- Drive ↔ Vercel은 HTTPS + Service Account 토큰
- KV에 저장되는 데이터는 AES-256-GCM 암호화 상태

### 한계 (의뢰자에게 사전 안내됨)
- `count=1` 그룹은 그 1인의 연봉이 곧 평균값으로 노출됨 (예: COO 1명)
- `min`/`max`로 그룹 내 최저/최고 연봉 정확히 노출
- 누적 추론 가능: "본부 합계 - (동료 추정값)"으로 개인 연봉 역산
- 단일 비밀번호 인증 (사용자별 권한 구분 없음)

### 더 강화하려면 (미적용)
- k-익명성: `count < N`인 그룹 노출 금지
- min/max 숨기고 사분위수만 노출
- NextAuth 등 사용자별 인증

---

## 11. 운영 가이드

### 데이터 갱신 (담당자)
1. Drive 폴더의 `latest.csv` 파일 덮어쓰기
   - **주의**: 같은 이름으로 새 파일을 *생성*하지 말고 *덮어쓰기* (또는 옛 파일 삭제 후 업로드)
   - Drive 폴더에 동명 파일 2개 있으면 어느 파일이 fetch될지 불명 → 항상 1개만 유지
2. 5분 이내 자동 반영. 즉시 확인은 대시보드에서 "↻ 새로고침" 클릭.

### 의사결정권자 사용 흐름
1. 대시보드 접속 → 비밀번호 입력
2. 본부별/조직별/직급별/직무별 탭 전환
3. 합계/평균 체크박스, 리텐션/성과 인센티브 토글 활용
4. **월별 추이**: `[◀] [▶]`로 월 이동하여 해당 월의 재직 인원·월급 합계 확인. "전체 보기"로 연 단위 + 전체 재직자 모드 전환

### Drive Service Account 권한 갱신
- Drive 폴더 → 공유 → Service Account 이메일이 있어야 함
- Service Account 이메일: JSON의 `client_email`
- 권한은 "뷰어"로 충분 (`drive.readonly` scope 사용 중)

---

## 12. 알려진 한계 / 향후 고도화 후보

### 단기 개선 후보
- [ ] `↻ 새로고침` 후 데이터 출처/시각을 UI에 노출 (`_meta.source`, `_meta.modifiedTime` 활용)
- [ ] Drive에 동명 파일이 여러 개일 때 `orderBy: "modifiedTime desc"` 추가해 최신 보장
- [ ] CSV 헤더 매핑 규칙을 환경변수로 외부화

### 시점별 정확한 연봉 계산 (구현 완료) ⭐
**의뢰자 결정**: 임금계약일과 직전 연봉을 인상 통계가 아닌 **시점별 정확한 연봉 산출**에 사용 (인상자 카운트 UI는 제거됨)

**CSV 컬럼**: `임금계약일` (`contractDate`), `이전 계약금액` (`prevSalary`)

**핵심 로직 (`lib/aggregate.js` `effectiveSalary`)**:
```js
const effectiveSalary = (d) => {
  const cd = d.contractDate || d.joinDate; // 임금계약일 비면 입사일로 대체
  if (cd && cd > queryDate && d.prevSalary > 0) {
    return d.prevSalary; // 조회 시점이 새 계약 발효 전 → 직전 연봉 사용
  }
  return d.salary;        // 그 외 → 현재 연봉
};
```

**조회 시점 (`queryDate`)**:
- `asOfMonth` 있으면 → 그 달 말일
- 없으면 → `Date.now()` (오늘)

**적용 범위**:
- `effectiveSalary` 결과로 `data`의 `salary` 필드를 통째로 치환 (`data = data.map(...)`)
- 이후 모든 집계(`totalSalary`, `baseSalaryTotal`, 탭별 agg, dist 등)가 시점별 연봉으로 자동 계산
- 인센티브(`incRet`, `inc26`)는 시점 영향 없이 그대로 사용

**의뢰자 명시 룰**:
- 퇴사일 빈칸 → 재직 중으로 간주 (입사일만 검사) — 이미 적용됨
- 직전 연봉 빈칸 → 그 직원은 현재 연봉만 사용 (시점 무관)
- 임금계약일 빈칸 → 입사일과 동일로 간주 (실질적으로 항상 현재 연봉)

**한계**: 직전 1회 변경만 추적 가능. 2회 이상의 과거 시점 (예: 24년 → 25년 → 26년)을 정확히 보려면 B/C/D 옵션 필요.

### 12개월 추이 라인 차트 (구현 완료) ⭐
**의뢰자 결정**:
- 선택 시점 기준 직전 12개월 평균 연봉 추이를 라인 차트로
- **그룹별 다중 라인** (현재 탭의 그룹 = 라인 색상 = 메인 막대 차트와 동일)
- 단위는 메인 차트와 동일 (`effectiveChartUnit` 재사용)
- 패널 위치: 메인 막대 차트 아래, 분포도 위

**구현**:
- `lib/aggregate.js`:
  - `snapshotAt(rawData, year, month0)` 헬퍼: 그 달의 재직자 + `effectiveSalary` 적용
  - `monthlySnapshots`: `referenceDate`에서 11개월 전부터 12개 스냅샷
  - 탭 루프 안에서 `trendArr`: 각 월의 그룹별 평균 + `_overallAvg` (전체 평균)
  - 출력: `tabs[tab.key].trend = trendArr`
- `components/DashboardView.jsx`:
  - `TrendTip` 커스텀 툴팁
  - `scaledTrendData` useMemo (`effectiveChartUnit`에 따라 /12)
  - `trendOverallChange` useMemo: 첫 월 `_overallAvg` ↔ 마지막 월 `_overallAvg` 변화율
  - `groupColorMap` useMemo: 메인 차트 색상 매핑 재사용
  - LineChart 패널: `chartData.map`으로 `<Line dataKey={groupName}>` 그리기
  - 우측 상단에 "지난 12개월 +X.X%" (음수면 빨강) 노출

**데이터 한계 (의뢰자 인지 사항)**:
- 직전 1회 변경만 추적 가능하므로, 12개월 추이는 직전 임금계약일 시점에 단일 점프만 표시됨
- 임금계약일이 추이 윈도우(과거 12개월) 안에 있는 직원만 변화 시각화됨
- 그 이전 시점은 직전 연봉 또는 현재 연봉으로 평탄선
- 이는 의뢰자에게 사전 안내됨

### 중기 고도화 후보
- [ ] 사용자별 인증 (NextAuth + 권한 레벨)
- [ ] k-익명성 적용 (count < N 그룹 마스킹)
- [ ] 시계열 분석 (월별 인건비 변화 추이 — 월 네비게이션의 데이터를 연결한 차트)
- [ ] PDF/Excel 익스포트
- [ ] 부서·직급 교차 분석 (히트맵)

### 알려진 한계
- `lib/drive.js`의 `cachedAuth`는 모듈 레벨 캐시 → Vercel warm 인스턴스 간 공유됨. JSON 키 회전 시 즉시 반영 안 될 수 있음 (대안: 재배포)
- Drive API quota: 분당 1,000건 (의사결정권자 다수 동시 접근 시에도 충분)
- 차트가 카테고리 수에 따라 동적 높이 조정되지만, 카테고리 20개 이상이면 X축 레이블 겹칠 수 있음
- 미래 월(예: 2027-12) 탐색 시 의뢰자 동의 하에 안내 문구 없음. 향후 인사이동 미반영 → 사용자 책임

---

## 13. 작업 원칙 (과거 실수 방지)

### 13.1. 함수 시그니처 변경 시 호출부 동시 업데이트
- 과거: `isExcluded` 함수를 `TAB_EXCLUDE` 객체로 교체하면서 `computeAll` 안의 호출부를 업데이트 안 함 → 500 에러
- 원칙: **정의 변경 시 같은 파일 내 모든 참조를 같은 edit에서 처리**, 작업 후 `Grep`으로 cross-reference 검증

### 13.2. 파일 전체를 읽고 확인 후 응답
- 부분 수정 후 "끝났습니다" 하면 안 됨. 변경 후 파일 끝까지 다시 읽어 정합성 확인.

### 13.3. Recharts 차트 수정 전 체크리스트
1. `scale="band"`나 `type="category"` 명시하지 마라 (기본값에 위임)
2. `padding={{ left: 0, right: 0 }}` 명시하지 마라
3. Bar는 항상 렌더링하되 dataKey와 fill을 conditional로
4. 변경 후 `합계만`, `평균만`, `둘 다` 세 모드 모두 확인

### 13.4. UI 변경 후 의뢰자에게 스크린샷 요청
- 의뢰자가 본 화면과 내가 상상한 화면이 다를 가능성 있음 (브라우저 캐시, hot reload 미반영 등)
- 큰 UI 변경 후엔 "다운로드 폴더의 스크린샷 보내달라"고 요청

### 13.5. 새 기능 추가 vs 기존 동작 보존
- 의뢰자는 "기획과 매칭" 여부를 중요시 → 새 기능 추가 시 기존 기능이 깨지지 않는지 명시적으로 확인
- 결정 사항 변경 시 반드시 논의 후 진행

### 13.6. 코드 일관성
- 컴포넌트 단일 파일 (`DashboardView.jsx`) 유지. 컴포넌트 추출은 정말 필요할 때만.
- 인라인 스타일 사용 중 (`S.panel`, `S.card` 헬퍼 객체). CSS 모듈/Tailwind 도입은 의뢰자와 상의 후.
- 한국어 주석 OK.

---

## 14. 환경 정보 (참고)

- 의뢰자 OS: Windows 11
- **프로젝트 경로**: `C:\Users\thoma\cap-dashboard-server\cap-dashboard\` (2026-06-09 기준)
  - 이전 위치: `C:\Users\thoma\Downloads\cap-dashboard-server\cap-dashboard\` (의뢰자가 홈으로 이동)
- 의뢰자는 `npm run dev` 로컬 실행 + Vercel 배포 흐름 사용 중
- Git 저장소: 있음 (master 브랜치 기본 사용)
- 의뢰자 GitHub 사용자: re111um

---

## 15. 핵심 파일 빠른 참조

| 작업 종류 | 봐야 할 파일 |
|---|---|
| CSV 컬럼 매핑 변경 | `lib/aggregate.js` `parseCSV` |
| 집계 로직 변경 / 탭별 필터 | `lib/aggregate.js` `computeAll`, `TAB_EXCLUDE` |
| 월별 추이 로직 | `lib/aggregate.js` `computeAll` 의 `asOfMonth` 블록 |
| 시점별 연봉 산출 로직 | `lib/aggregate.js` `effectiveSalary` |
| 12개월 추이 (라인 차트) | `lib/aggregate.js` `snapshotAt`, `monthlySnapshots`, `trendArr` 블록 + `components/DashboardView.jsx` LineChart 패널 |
| 차트 UI 변경 | `components/DashboardView.jsx` Bar Chart 섹션 |
| 분포도 변경 | `components/DashboardView.jsx` `RangeChart` 함수 |
| 월 네비게이션 UI | `components/DashboardView.jsx` "Month Navigation" 블록 |
| Drive 연동 변경 | `lib/drive.js` |
| 캐시 TTL 변경 | `app/api/dashboard/route.js` `CACHE_TTL_SEC` |
| 환경변수 추가/변경 | Vercel Settings + 이 문서 5번 섹션 갱신 |
| 비밀번호 변경 | Vercel `DASHBOARD_PASSWORD` 환경변수 |
| 정렬 순서 변경 | `lib/aggregate.js` `DEPT_ORDER`, `RANK_ORDER` |
| 차트 색상 변경 | `components/DashboardView.jsx` 상단 `BASE` 상수 + 9.7 팔레트 |

---

## 16. 작업 시작 시 권장 절차

1. 이 문서 읽기
2. 의뢰자 요청 파악 → 모호하면 질문 (추측 금지)
3. 영향 범위 파악 → 관련 파일 `Read`로 현재 상태 확인
4. 큰 변경이면 **계획 먼저 공유** → 의뢰자 얼라인 → 적용
5. 적용 후 `Grep`으로 cross-reference 검증
6. 의뢰자에게 검증 포인트 알리며 보고

---

*마지막 업데이트: 2026-06-09 — 월별 추이(`asOfMonth`) + 퇴사일 + 시점별 정확한 연봉 계산(`effectiveSalary`) + 12개월 추이 라인 차트 구현. 새 작업 적용 시 관련 섹션과 이 줄 갱신할 것.*
