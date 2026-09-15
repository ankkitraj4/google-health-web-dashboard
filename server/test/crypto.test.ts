import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, randomToken } from '../src/crypto.js';

describe('crypto', () => {
  it('round-trips a secret through encrypt/decrypt', () => {
    const plaintext = '1//09-a-real-looking-refresh-token';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-plaintext');
    const b = encryptSecret('same-plaintext');
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const encrypted = encryptSecret('secret-value');
    const [iv, tag, data] = encrypted.split(':');
    const tamperedByte = Buffer.from(data, 'base64');
    tamperedByte[0] ^= 0xff;
    const tampered = [iv, tag, tamperedByte.toString('base64')].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('randomToken produces distinct, non-trivial tokens', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
