import { google } from "googleapis";

const DEFAULT_FILENAME = "latest.csv";

export function isDriveConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

let cachedClient = null;
function getDriveClient() {
  if (cachedClient) return cachedClient;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
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
