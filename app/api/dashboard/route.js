import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { parseCSV, computeAll } from "@/lib/aggregate";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

async function loadEncryptedData() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import("@vercel/kv");
      const data = await kv.get("cap_encrypted");
      if (data) return data;
    } catch {}
  }
  const filePath = join(process.cwd(), "data", "encrypted.json");
  if (existsSync(filePath)) return readFileSync(filePath, "utf-8");
  return null;
}

export async function POST(request) {
  try {
    const { password, incRet, incPerf, hideClv, asOfDate } = await request.json();

    if (password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const encryptedJson = await loadEncryptedData();
    if (!encryptedJson) {
      return NextResponse.json({ error: "no_data" }, { status: 404 });
    }

    const csvText = decrypt(encryptedJson, process.env.ENCRYPTION_KEY);
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
      hideClv: !!hideClv,
      asOfDate: asOfDate || null,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("서버 에러:", e);
    return NextResponse.json({ error: "server_error", details: e.message }, { status: 500 });
  }
}
