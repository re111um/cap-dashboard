import { google } from "googleapis";

const DEFAULT_FILENAME = "latest.csv";

export function isDriveConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

function loadCredentials() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.");

  // JSON 원문 또는 base64 인코딩된 JSON 양쪽 모두 지원
  let jsonStr = raw;
  if (!raw.startsWith("{")) {
    try {
      jsonStr = Buffer.from(raw, "base64").toString("utf-8");
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON base64 디코딩 실패");
    }
  }

  let creds;
  try {
    creds = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("Service Account JSON 파싱 실패: " + e.message);
  }

  if (!creds.client_email || !creds.private_key) {
    throw new Error("Service Account JSON에 client_email 또는 private_key가 없습니다.");
  }

  // private_key 안의 이스케이프된 줄바꿈(\n 문자열)을 실제 줄바꿈으로 정규화
  creds.private_key = creds.private_key.replace(/\\n/g, "\n");

  return creds;
}

let cachedClient = null;
function getDriveClient() {
  if (cachedClient) return cachedClient;
  const credentials = loadCredentials();
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ["https://www.googleapis.com/auth/drive.readonly"]
  );
  cachedClient = google.drive({ version: "v3", auth });
  return cachedClient;
}

/**
 * Google Drive 폴더에서 고정 파일명 CSV를 가져와 텍스트로 반환
 * UTF-8 → 한글 키워드 없으면 EUC-KR로 재디코딩
 */
export async function fetchCsvFromDrive() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const filename = process.env.GOOGLE_DRIVE_FILENAME || DEFAULT_FILENAME;
  const drive = getDriveClient();

  const list = await drive.files.list({
    q: `'${folderId}' in parents and name = '${filename}' and trashed = false`,
    fields: "files(id, name, modifiedTime)",
    pageSize: 1,
  });

  if (!list.data.files || list.data.files.length === 0) {
    throw new Error(`Drive 폴더에서 '${filename}' 파일을 찾을 수 없습니다.`);
  }

  const fileId = list.data.files[0].id;
  const modifiedTime = list.data.files[0].modifiedTime;

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(res.data);
  let text = new TextDecoder("utf-8").decode(buffer);
  if (!text.includes("본부") && !text.includes("계약")) {
    text = new TextDecoder("euc-kr").decode(buffer);
  }

  return { csvText: text, modifiedTime };
}
