import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

type BrowserStatePayload = {
  cookies?: unknown[];
  origins?: Array<{ origin?: string; localStorage?: Array<{ name?: string; value?: string }> }>;
};

function key() {
  const secret = process.env.BROWSER_STATE_ENCRYPTION_KEY;
  if (!secret) throw new Error("BROWSER_STATE_ENCRYPTION_KEY is required.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function validatePlaywrightStorageState(value: unknown): value is BrowserStatePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as BrowserStatePayload;
  if (!Array.isArray(payload.cookies) && !Array.isArray(payload.origins)) return false;
  if (payload.cookies && !Array.isArray(payload.cookies)) return false;
  if (payload.origins && !Array.isArray(payload.origins)) return false;
  return true;
}

export function encryptBrowserState(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptBrowserState(ciphertext: string) {
  const payload = Buffer.from(ciphertext, "base64url");
  const decipher = crypto.createDecipheriv(algorithm, key(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8"));
}