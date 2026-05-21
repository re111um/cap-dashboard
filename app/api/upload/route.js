import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { parseCSV, computeAll } from "@/lib/aggregate";
import { writeFileSync } from "fs";
import { join } from "path";

export async function POST(request) {
  try {
    const { password, csvText } = await request.json();

    if (password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const rawData = parseCSV(csvText);
    if (!rawData.length) {
      return NextResponse.json({ error: "parse_failed" }, { status: 400 });
    }

    const encryptedJson = encrypt(csvText, process.env.ENCRYPTION_KEY);
    let saved = false;

    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      try {
        const { kv } = await import("@vercel/kv");
        await kv.set("cap_encrypted", encryptedJson);
        saved = true;
      } catch (e) {
        console.error("KV 저장 실패:", e);
      }
    }

    if (!saved) {
      try {
        writeFileSync(join(process.cwd(), "data", "encrypted.json"), encryptedJson);
        saved = true;
      } catch {}
    }

    if (!saved) {
      return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
    }

    const preview = computeAll(rawData, { incRet: false, incPerf: false, hideClv: false, asOfDate: null });

    return NextResponse.json({
      success: true,
      count: rawData.length,
      preview,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
