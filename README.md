# Featuring 연봉 대시보드 (Server Edition)

서버 기반 연봉 대시보드. 개인별 연봉 데이터는 서버에서만 처리되며, 브라우저에는 집계 결과만 전달됩니다.

## 보안 구조

```
[브라우저]  ←──  집계 데이터만 전달 (본부별 합계, 평균 등)
    │
[Vercel API]  ←──  서버에서 복호화 + 집계
    │
[encrypted.json]  ←──  AES-256-GCM 암호화된 원본 데이터
```

- F12 → Network 탭을 열어도 **개인별 연봉은 보이지 않음**
- 원본 데이터는 서버 메모리에서만 일시적으로 복호화

## 초기 설정

### 1. 환경변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local` 편집:
```
ENCRYPTION_KEY=랜덤32자이상문자열
DASHBOARD_PASSWORD=의사결정권자비밀번호
```

### 2. 데이터 암호화

```bash
node scripts/encrypt.js ./연봉_대시보드_양식.csv
```

→ `data/encrypted.json` 생성

### 3. 로컬 실행

```bash
npm install
npm run dev
```

→ http://localhost:3000

## Vercel 배포

### 1. GitHub에 push

```bash
git init && git add -A && git commit -m "init"
git remote add origin https://github.com/USERNAME/cap-dashboard.git
git push -u origin main
```

### 2. Vercel에서 Import

1. [vercel.com](https://vercel.com) → New Project → GitHub repo 선택
2. Environment Variables에 추가:
   - `ENCRYPTION_KEY` = 로컬과 동일한 값
   - `DASHBOARD_PASSWORD` = 로컬과 동일한 값
3. Deploy

### 3. 데이터 갱신

```bash
# Google Sheets → CSV 다운로드
node scripts/encrypt.js ./새파일.csv
git add data/encrypted.json
git commit -m "data: update salary data"
git push
# → Vercel 자동 재배포
```

## 기능

- 본부별 / 조직별 / 직급별 / 직무별 4개 탭
- 합계 막대 + 평균 꺾은선 오버레이 (토글 가능, 최소 1개 필수)
- 연봉 분포 레인지 차트 (최저 / 중간값 / 최고)
- 리텐션/사이닝, 성과 인센티브 토글
- C-lv 제외 토글
- 인원/연봉 비율, 월급 합계 표시
- AES-256-GCM 데이터 암호화
- EUC-KR / UTF-8 CSV 자동 인식
