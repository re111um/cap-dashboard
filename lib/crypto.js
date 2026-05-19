import crypto from "crypto";

const ALGO = "aes-256-gcm";

export function encrypt(plaintext, key) {
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

export function decrypt(encryptedJson, key) {
  try {
    const { iv, tag, data } = JSON.parse(encryptedJson);
    const keyHash = crypto.createHash("sha256").update(key).digest();
    const decipher = crypto.createDecipheriv(ALGO, keyHash, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    let dec = decipher.update(data, "base64", "utf8");
    dec += decipher.final("utf8");
    return dec;
  } catch {
    return null;
  }
}
