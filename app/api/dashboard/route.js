import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { parseCSV, computeAll } from "@/lib/aggregate";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function POST(request) {
  try {
    const { password, incRet, incPerf, hideClv } = await request.json();

    if (password !== process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const filePath = join(process.cwd(), "data", "encrypted.json");
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "no_data" }, { status: 404 });
    }

    const encryptedJson = readFileSync(filePath, "utf-8");
    const csvText = decrypt(encryptedJson, process.env.ENCRYPTION_KEY);
    if (!csvText) {
      return NextResponse.json({ error: "decrypt_failed" }, { status: 500 });
    }

    const rawData = parseCSV(csvText);
    if (!rawData.length) {
      return NextResponse.json({ error: "empty_data" }, { status: 500 });
    }

    // ⚠️ 핵심: rawData는 여기서만 사용되고, 클라이언트에 전달되지 않음
    const result = computeAll(rawData, {
      incRet: !!incRet,
      incPerf: !!incPerf,
      hideClv: !!hideClv,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
