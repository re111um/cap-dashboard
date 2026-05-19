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

    // 로컬 개발 환경에서는 파일로 저장 (Vercel에서는 읽기 전용이므로 무시됨)
    try {
      writeFileSync(join(process.cwd(), "data", "encrypted.json"), encryptedJson);
    } catch {}

    // 집계 미리보기 반환
    const preview = computeAll(rawData, { incRet: false, incPerf: false, hideClv: false });

    return NextResponse.json({
      success: true,
      count: rawData.length,
      preview,
      encryptedFile: encryptedJson, // 클라이언트에서 다운로드용
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
