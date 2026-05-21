import { NextResponse } from "next/server";
import { encrypt, decrypt } from "@/lib/crypto";
import { parseCSV, computeAll } from "@/lib/aggregate";
import { isDriveConfigured, fetchCsvFromDrive } from "@/lib/drive";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CACHE_KEY = "cap_encrypted_cache";
const CACHE_TTL_SEC = 300; // 5분

async function getKV() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

/**
 * 우선순위:
 * 1. force=true가 아니면 KV 캐시 확인 (5분 TTL)
 * 2. Drive 연동 설정 시 Drive에서 fetch → 서버에서 재암호화 → KV에 캐싱
 * 3. KV 수동 업로드 데이터 (cap_encrypted)
 * 4. 로컬 파일 (data/encrypted.json)
 */
async function loadEncryptedData(force = false) {
  const kv = await getKV();

  if (!force && kv) {
    try {
      const cached = await kv.get(CACHE_KEY);
      if (cached) return { encryptedJson: cached, source: "cache" };
    } catch {}
  }

  if (isDriveConfigured()) {
    try {
      const { csvText, modifiedTime } = await fetchCsvFromDrive();
      const encryptedJson = encrypt(csvText, process.env.ENCRYPTION_KEY);
      if (kv) {
        try {
          await kv.set(CACHE_KEY, encryptedJson, { ex: CACHE_TTL_SEC });
        } catch (e) {
          console.error("KV 캐시 저장 실패:", e);
        }
      }
      return { encryptedJson, source: "drive", modifiedTime };
    } catch (e) {
      console.error("Drive fetch 실패:", e.message);
    }
  }

  if (kv) {
    try {
      const uploaded = await kv.get("cap_encrypted");
      if (uploaded) return { encryptedJson: uploaded, source: "kv" };
    } catch {}
  }

  const filePath = join(process.cwd(), "data", "encrypted.json");
  if (existsSync(filePath)) {
    return { encryptedJson: readFileSync(filePath, "utf-8"), source: "file" };
  }

  return null;
}

export async function POST(request) {
  try {
    const { password, incRet, incPerf, asOfDate, force } = await request.json();

    if (password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const loaded = await loadEncryptedData(!!force);
    if (!loaded) {
      return NextResponse.json({ error: "no_data" }, { status: 404 });
    }

    const csvText = decrypt(loaded.encryptedJson, process.env.ENCRYPTION_KEY);
    if (!csvText) {
      return NextResponse.json({ error: "decrypt_failed" }, { status: 500 });
    }

    const rawData = parseCSV(csvText);
    if (!rawData.length) {
      return NextResponse.json({ error: "empty_data" }, { status: 500 });
    }

    const result = computeAll(rawData, {
      incRet: !!incRet,
      incPerf: !!incPerf,
      asOfDate: asOfDate || null,
    });

    return NextResponse.json({
      ...result,
      _meta: {
        source: loaded.source,
        modifiedTime: loaded.modifiedTime || null,
      },
    });
  } catch (e) {
    console.error("서버 에러:", e);
    return NextResponse.json({ error: "server_error", details: e.message }, { status: 500 });
  }
}
