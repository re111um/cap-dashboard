import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { parseCSV, computeAll } from "@/lib/aggregate";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function POST(request) {
  try {
    const { password, incRet, incPerf, hideClv } = await request.json();

    // 코드 추가
console.log("프론트엔드에서 보낸 비번:", password);
console.log("Vercel에 저장된 비번:", process.env.DASHBOARD_PASSWORD);

if (password !== process.env.DASHBOARD_PASSWORD) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

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
    // 1. Vercel 로그에 에러의 상세 원인을 빨간 글씨로 출력합니다.
    console.error("서버 에러 상세 내역:", e); 
    
    // 2. 프론트엔드로 에러 메시지(e.message)를 같이 보내줍니다.
    return NextResponse.json({ error: "server_error", details: e.message }, { status: 500 });
  }
}
