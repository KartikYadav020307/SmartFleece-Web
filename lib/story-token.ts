import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "crypto";

/**
 * Story Token Key Management & Security:
 *
 * Requirements:
 * - High entropy: STORY_SECRET (or SESSION_SECRET fallback) must provide at least 256 bits of entropy.
 * - HKDF key derivation: Uses RFC 5869 HKDF with domain-separated info string ("smartfleece-story-token-v2")
 *   to derive a dedicated 256-bit AES key.
 * - Key Rotation: Supports STORY_SECRET_PREVIOUS. If token decryption fails with the active secret,
 *   resolution falls back to the previous secret, ensuring physical QR labels remain scannable during secret rotation.
 * - Backward Compatibility: Resolves legacy Module 6.3 v1 tokens (st_<nonce12Hex>_<sig16Hex>_<lotIdHex>)
 *   using constant-time HMAC verification so existing printed materials are not broken.
 */
const RAW_SECRET = process.env.STORY_SECRET ?? process.env.SESSION_SECRET ?? "smartfleece-story-token-default-secret-32-chars-entropy-min";
const RAW_SECRET_PREVIOUS = process.env.STORY_SECRET_PREVIOUS ?? null;

// Validate secret in production
if (process.env.NODE_ENV === "production" && (!process.env.STORY_SECRET && !process.env.SESSION_SECRET)) {
  console.warn("[SECURITY ALERT] STORY_SECRET or SESSION_SECRET must be set with at least 32 characters in production!");
}

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "smartfleece-story-token-v2", 32));
}

const ACTIVE_AES_KEY = deriveKey(RAW_SECRET);
const PREVIOUS_AES_KEY = RAW_SECRET_PREVIOUS ? deriveKey(RAW_SECRET_PREVIOUS) : null;

/**
 * Generate a dedicated, opaque, high-entropy public token for a finished lot's Fiber Story.
 *
 * Version 2 Structure (AES-256-GCM authenticated encryption):
 *   st_<iv24Hex>_<tag32Hex>_<ciphertextHex>
 *
 * Properties:
 * - 4-part split compatible with existing Module 6.3 contract and regexes (st_[hex]_[hex]_[hex]).
 * - Confidentiality: Opaque ciphertext; internal CUIDs cannot be recovered without STORY_SECRET.
 * - Authenticity & Integrity: 128-bit (32 hex char) GCM authentication tag prevents any token tampering or forgery.
 * - Entropy: 96-bit (24 hex char) cryptographically secure random IV ensures unique tokens on every generation.
 * - Stateless: No database table or lookup required.
 */
export function generateStoryToken(lotId: string): string {
  const iv = randomBytes(12); // 96-bit standard GCM IV (24 hex characters)
  const cipher = createCipheriv("aes-256-gcm", ACTIVE_AES_KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(lotId, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 bytes = 32 hex chars

  return `st_${iv.toString("hex")}_${tag.toString("hex")}_${encrypted.toString("hex")}`;
}

/**
 * Decrypt a v2 AES-256-GCM token using the specified key.
 */
function decryptV2WithKey(key: Buffer, ivHex: string, tagHex: string, cipherHex: string): string | null {
  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(cipherHex, "hex");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const lotId = decrypted.toString("utf8");
    return lotId && lotId.length >= 5 ? lotId : null;
  } catch {
    return null;
  }
}

/**
 * Verify a legacy v1 HMAC token (Module 6.3 format).
 */
function resolveV1WithSecret(secret: string, nonce: string, signature: string, lotHex: string): string | null {
  try {
    const lotId = Buffer.from(lotHex, "hex").toString("utf8");
    if (!lotId || lotId.length < 5) return null;

    const expectedHmac = createHmac("sha256", secret)
      .update(`${lotId}:${nonce}`)
      .digest("hex")
      .slice(0, 16);

    if (signature.length !== expectedHmac.length) return null;

    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expectedHmac, "utf8");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    return lotId;
  } catch {
    return null;
  }
}

/**
 * Verify and resolve a story token to its underlying lot ID.
 * Returns null if the token format is invalid, signature mismatch, or tampered.
 *
 * Supports:
 * - v2 4-part: st_<iv24Hex>_<tag32Hex>_<ciphertextHex>
 * - v2 explicit 5-part: st_v2_<iv24Hex>_<tag32Hex>_<ciphertextHex>
 * - v1 legacy 4-part: st_<nonce12Hex>_<sig16Hex>_<lotIdHex> (preserves previously printed Module 6.3 tags)
 * - v1 explicit 5-part: st_v1_<nonce12Hex>_<sig16Hex>_<lotIdHex>
 */
export function resolveStoryToken(token: string): string | null {
  if (!token || typeof token !== "string" || !token.startsWith("st_")) return null;
  const parts = token.split("_");

  // Explicit 5-part versioned tokens
  if (parts.length === 5) {
    if (parts[1] === "v2") {
      const [, , ivHex, tagHex, cipherHex] = parts;
      const res = decryptV2WithKey(ACTIVE_AES_KEY, ivHex, tagHex, cipherHex);
      if (res) return res;
      if (PREVIOUS_AES_KEY) return decryptV2WithKey(PREVIOUS_AES_KEY, ivHex, tagHex, cipherHex);
      return null;
    }
    if (parts[1] === "v1") {
      const [, , nonce, sig, lotHex] = parts;
      const res = resolveV1WithSecret(RAW_SECRET, nonce, sig, lotHex);
      if (res) return res;
      if (RAW_SECRET_PREVIOUS) return resolveV1WithSecret(RAW_SECRET_PREVIOUS, nonce, sig, lotHex);
      return null;
    }
    return null;
  }

  // Standard 4-part tokens: ["st", p1, p2, p3]
  if (parts.length === 4) {
    const [, p1, p2, p3] = parts;
    if (!p1 || !p2 || !p3) return null;

    // Check if v2 by structure: iv is 24 hex chars (12 bytes), tag is 32 hex chars (16 bytes)
    if (p1.length === 24 && p2.length === 32) {
      const res = decryptV2WithKey(ACTIVE_AES_KEY, p1, p2, p3);
      if (res) return res;
      if (PREVIOUS_AES_KEY) return decryptV2WithKey(PREVIOUS_AES_KEY, p1, p2, p3);
      return null;
    }

    // Check if legacy v1: nonce is 12 hex chars (6 bytes), sig is 16 hex chars (8 bytes)
    if (p1.length === 12 && p2.length === 16) {
      const res = resolveV1WithSecret(RAW_SECRET, p1, p2, p3);
      if (res) return res;
      if (RAW_SECRET_PREVIOUS) return resolveV1WithSecret(RAW_SECRET_PREVIOUS, p1, p2, p3);
      return null;
    }

    // Fallback attempts
    const v2Res = decryptV2WithKey(ACTIVE_AES_KEY, p1, p2, p3);
    if (v2Res) return v2Res;
    const v1Res = resolveV1WithSecret(RAW_SECRET, p1, p2, p3);
    if (v1Res) return v1Res;
  }

  return null;
}
