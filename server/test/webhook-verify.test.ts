import { describe, it, expect, beforeAll, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyWebhookSignature } from '../src/webhook-verify.js';

// Builds a synthetic Tink-format EcdsaPublicKey keyset (same wire shape
// webhook-verify.ts's protobuf reader expects) backed by a real P-256
// keypair we hold the private half of — needed because only Google holds
// the private key for its real published keyset (see plan milestone M8).
function encodeVarint(n: number): Buffer {
  const bytes: number[] = [];
  while (n > 0x7f) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
  return Buffer.from(bytes);
}
function encodeField(fieldNumber: number, payload: Buffer): Buffer {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  return Buffer.concat([tag, encodeVarint(payload.length), payload]);
}
function tinkPrefix(keyId: number): Buffer {
  const buf = Buffer.alloc(5);
  buf[0] = 1;
  buf.writeUInt32BE(keyId >>> 0, 1);
  return buf;
}

const KEY_ID = 42;
let privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];

beforeAll(() => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  privateKey = pair.privateKey;
  const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const ecdsaPublicKeyProto = Buffer.concat([encodeField(3, x), encodeField(4, y)]);
  const keyset = {
    primaryKeyId: KEY_ID,
    key: [
      {
        keyData: { typeUrl: 'type.googleapis.com/google.crypto.tink.EcdsaPublicKey', value: ecdsaPublicKeyProto.toString('base64'), keyMaterialType: 'ASYMMETRIC_PUBLIC' },
        status: 'ENABLED',
        keyId: KEY_ID,
        outputPrefixType: 'TINK',
      },
    ],
  };
  // webhook-verify.ts fetches this URL once and caches it for 24h.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(keyset), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  );
});

function signBody(body: Buffer): string {
  const der = sign('sha256', body, { key: privateKey, dsaEncoding: 'der' });
  return Buffer.concat([tinkPrefix(KEY_ID), der]).toString('base64');
}

describe('verifyWebhookSignature', () => {
  it('accepts a validly-signed body', async () => {
    const body = Buffer.from(JSON.stringify({ data: { healthUserId: 'u1', dataType: 'steps', operation: 'UPSERT' } }));
    expect(await verifyWebhookSignature(body, signBody(body))).toBe(true);
  });

  it('rejects when the body was tampered with after signing', async () => {
    const body = Buffer.from(JSON.stringify({ data: { healthUserId: 'u1' } }));
    const signature = signBody(body);
    const tampered = Buffer.from(JSON.stringify({ data: { healthUserId: 'attacker-controlled' } }));
    expect(await verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a signature whose key id prefix matches no key in the keyset', async () => {
    const body = Buffer.from('{}');
    const der = sign('sha256', body, { key: privateKey, dsaEncoding: 'der' });
    const wrongPrefixSig = Buffer.concat([tinkPrefix(999999), der]).toString('base64');
    expect(await verifyWebhookSignature(body, wrongPrefixSig)).toBe(false);
  });

  it('rejects garbage that is not valid base64-decodable signature bytes', async () => {
    expect(await verifyWebhookSignature(Buffer.from('{}'), 'not-a-real-signature')).toBe(false);
  });

  it('rejects a missing signature header', async () => {
    expect(await verifyWebhookSignature(Buffer.from('{}'), undefined)).toBe(false);
  });
});
