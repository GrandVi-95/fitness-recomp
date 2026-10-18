// ─── At-rest encryption for user-supplied secrets (AI API keys) ─────────────
// AES-256-GCM. Key material: APP_ENCRYPTION_KEY, else AUTH_SECRET, else the
// master password (hashed to 32 bytes). Stored format: "enc:v1:<iv>:<tag>:<ct>"
// (base64). Values without the prefix are legacy plaintext and are returned
// as-is so existing rows keep working until they're re-saved.
// Server-only (node:crypto).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const PREFIX = "enc:v1:"

function getKey(): Buffer | null {
  const material =
    process.env.APP_ENCRYPTION_KEY || process.env.AUTH_SECRET || process.env.APP_MASTER_PASSWORD
  if (!material) return null
  return createHash("sha256").update(`secrets:${material}`).digest()
}

export function encryptSecret(plain: string): string {
  const key = getKey()
  if (!key) throw new Error("No encryption key configured (APP_ENCRYPTION_KEY)")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`
}

/** Decrypts a stored secret. Returns null when it can't be decrypted
 *  (e.g. the key material was rotated) — callers treat that as "no key". */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null
  if (!stored.startsWith(PREFIX)) return stored // legacy plaintext
  const key = getKey()
  if (!key) return null
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":")
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"))
    decipher.setAuthTag(Buffer.from(tagB64, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
