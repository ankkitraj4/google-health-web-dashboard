import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';

// Verifies Google Health API webhook signatures for real, against Google's
// actual published key material — not a stub. Two layers per Google's docs
// (developers.google.com/health/webhooks):
//   1. A caller-configured shared secret in the Authorization header.
//   2. A Tink-signed (ECDSA P-256 / SHA-256) signature over the raw request
//      body in the GOOGLE-HEALTH-API-SIGNATURE header, verified against
//      Google's rotating public keyset.

const KEYSET_URL = 'https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json';
const KEYSET_TTL_MS = 24 * 60 * 60 * 1000; // Google rotates keys every 30 days; refetching daily is plenty.

interface TinkKey {
  keyId: number;
  publicKey: KeyObject;
}

let cachedKeys: TinkKey[] | null = null;
let cachedAt = 0;

function readVarint(buf: Buffer, offset: number): [value: number, next: number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    const byte = buf[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, pos];
}

// Minimal protobuf reader for Tink's EcdsaPublicKey message (fields: 1
// version varint, 2 params submessage, 3 x bytes, 4 y bytes) — just enough
// to pull the raw EC point out, not a general protobuf implementation.
function parseEcdsaPublicKey(bytes: Buffer): { x: Buffer; y: Buffer } {
  let offset = 0;
  let x: Buffer | null = null;
  let y: Buffer | null = null;
  while (offset < bytes.length) {
    const [tag, afterTag] = readVarint(bytes, offset);
    offset = afterTag;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;
    if (wireType === 0) {
      const [, after] = readVarint(bytes, offset);
      offset = after;
    } else if (wireType === 2) {
      const [len, afterLen] = readVarint(bytes, offset);
      offset = afterLen;
      const value = bytes.subarray(offset, offset + len);
      offset += len;
      if (fieldNumber === 3) x = Buffer.from(value);
      if (fieldNumber === 4) y = Buffer.from(value);
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType} in EcdsaPublicKey`);
    }
  }
  if (!x || !y) throw new Error('EcdsaPublicKey message missing x or y coordinate');
  return { x, y };
}

// EC coordinates from protobuf `bytes` fields can carry a leading zero
// (two's-complement sign padding) or be shorter than 32 bytes — normalize
// to exactly 32 bytes so it's a valid P-256 JWK coordinate.
function normalizeCoordinate(buf: Buffer): Buffer {
  let b = buf;
  while (b.length > 32 && b[0] === 0) b = b.subarray(1);
  if (b.length < 32) b = Buffer.concat([Buffer.alloc(32 - b.length), b]);
  return b;
}

async function loadKeyset(): Promise<TinkKey[]> {
  if (cachedKeys && Date.now() - cachedAt < KEYSET_TTL_MS) return cachedKeys;
  let res: Response;
  try {
    res = await fetch(KEYSET_URL);
  } catch (err) {
    if (cachedKeys) return cachedKeys; // serve stale rather than fail open or fail closed on a network blip
    throw err;
  }
  if (!res.ok) {
    if (cachedKeys) return cachedKeys;
    throw new Error(`Failed to fetch webhook public keyset (${res.status})`);
  }
  const data = (await res.json()) as {
    key: Array<{ keyId: number; status: string; keyData: { value: string } }>;
  };
  const keys: TinkKey[] = [];
  for (const k of data.key) {
    if (k.status !== 'ENABLED') continue;
    const raw = Buffer.from(k.keyData.value, 'base64');
    const { x, y } = parseEcdsaPublicKey(raw);
    const jwk = {
      kty: 'EC' as const,
      crv: 'P-256' as const,
      x: normalizeCoordinate(x).toString('base64url'),
      y: normalizeCoordinate(y).toString('base64url'),
    };
    keys.push({ keyId: k.keyId, publicKey: createPublicKey({ key: jwk, format: 'jwk' }) });
  }
  cachedKeys = keys;
  cachedAt = Date.now();
  return keys;
}

// Tink's "TINK" output prefix on the signature bytes: 0x01 followed by the
// big-endian 4-byte key id, prepended to the raw DER ECDSA signature.
function tinkPrefix(keyId: number): Buffer {
  const buf = Buffer.alloc(5);
  buf[0] = 1;
  buf.writeUInt32BE(keyId >>> 0, 1);
  return buf;
}

export async function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Promise<boolean> {
  if (!signatureHeader) return false;
  let sig: Buffer;
  try {
    sig = Buffer.from(signatureHeader, 'base64');
  } catch {
    return false;
  }
  if (sig.length <= 5) return false;

  const keys = await loadKeyset();
  const prefix = sig.subarray(0, 5);
  const derSignature = sig.subarray(5);
  for (const k of keys) {
    if (!prefix.equals(tinkPrefix(k.keyId))) continue;
    try {
      return cryptoVerify('sha256', rawBody, { key: k.publicKey, dsaEncoding: 'der' }, derSignature);
    } catch {
      return false;
    }
  }
  return false; // no key in the current keyset matches this signature's key id
}
