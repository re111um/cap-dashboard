#!/usr/bin/env node
/**
 * CSV 파일을 암호화하여 data/encrypted.json으로 저장
 *
 * 사용법:
 *   node scripts/encrypt.js <CSV파일경로>
 *
 * 환경변수 ENCRYPTION_KEY가 필요합니다 (.env.local에 설정)
 *
 * 예시:
 *   ENCRYPTION_KEY=mykey node scripts/encrypt.js ./salary.csv
 */
import crypto from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const ALGO = "aes-256-gcm";

function encrypt(plaintext, key) {
  const keyHash = crypto.createHash("sha256").update(key).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyHash, iv);
  let enc = cipher.update(plaintext, "utf8", "base64");
  enc += cipher.final("base64");
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc,
  });
}

// .env.local 파일에서 환경변수 로드 (간단 구현)
function loadEnv() {
  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.+)$/);
      if (match && !process.env[match[1].trim()]) {
        process.env[match[1].trim()] = match[2].trim();
      }
    }
  }
}

loadEnv();

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("사용법: node scripts/encrypt.js <CSV파일경로>");
  console.error("예시:   node scripts/encrypt.js ./연봉_대시보드_양식.csv");
  process.exit(1);
}

const key = process.env.ENCRYPTION_KEY;
if (!key) {
  console.error("오류: ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.");
  console.error(".env.local 파일에 ENCRYPTION_KEY=... 를 추가하세요.");
  process.exit(1);
}

const fullPath = resolve(csvPath);
if (!existsSync(fullPath)) {
  console.error(`오류: 파일을 찾을 수 없습니다: ${fullPath}`);
  process.exit(1);
}

// EUC-KR 감지 및 변환
let csvText = readFileSync(fullPath);
try {
  // UTF-8로 먼저 시도
  const utf8Text = csvText.toString("utf-8");
  if (utf8Text.includes("본부") || utf8Text.includes("조직") || utf8Text.includes("직급")) {
    csvText = utf8Text;
  } else {
    throw new Error("not utf8");
  }
} catch {
  // EUC-KR로 재시도 (TextDecoder 사용)
  const decoder = new TextDecoder("euc-kr");
  csvText = decoder.decode(csvText);
}

const encrypted = encrypt(csvText, key);
const outPath = join(process.cwd(), "data", "encrypted.json");
writeFileSync(outPath, encrypted);

const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
console.log(`✅ 암호화 완료: ${lines.length - 1}행 → ${outPath}`);
console.log(`   파일 크기: ${(Buffer.byteLength(encrypted) / 1024).toFixed(1)}KB`);
console.log(`\n다음 단계: git add data/encrypted.json && git commit && git push`);
