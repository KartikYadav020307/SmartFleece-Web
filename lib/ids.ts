import { randomBytes } from "crypto";

// Crockford-ish alphabet without ambiguous characters (no 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function shortCode(len = 6): string {
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

/** Opaque, human-readable lot identifier — this is the QR payload. */
export function newLotCode(): string {
  return `LOT-${shortCode(6)}`;
}

/** Unguessable tracking token for the public customer tracking page. */
export function newTrackingToken(): string {
  return randomBytes(18).toString("base64url");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}
