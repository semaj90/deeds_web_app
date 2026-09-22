import { describe, expect, it } from 'vitest';
import {
  UUID_DERIVATION_REVISION,
  canonicalUUIDDerivationInput,
  deriveUUID,
  randomUUIDv7,
  uuid,
} from './uuid.js';

const ATTRIBUTES = {
  identityKind: 'openspec-domain-class',
  namespace: 'parent-atlas',
};

describe('uuid.derive', () => {
  it('is deterministic for identical domain class and attributes', async () => {
    const a = await uuid.derive('Graph', ATTRIBUTES);
    const b = await deriveUUID('Graph', { namespace: 'parent-atlas', identityKind: 'openspec-domain-class' });
    expect(a).toBe(b);
    expect(a).toBe('e5881fdd-8cdf-8c91-958e-372fe4d4d36b');
  });

  it('canonicalizes attribute key ordering', () => {
    const a = canonicalUUIDDerivationInput('Graph', {
      namespace: 'parent-atlas',
      identityKind: 'openspec-domain-class',
    });
    const b = canonicalUUIDDerivationInput('Graph', {
      identityKind: 'openspec-domain-class',
      namespace: 'parent-atlas',
    });
    expect(a).toBe(b);
  });

  it('keeps domain class case significant', async () => {
    const upper = await deriveUUID('Graph', ATTRIBUTES);
    const lower = await deriveUUID('graph', ATTRIBUTES);
    expect(upper).not.toBe(lower);
  });

  it('changes identity when stable attributes change', async () => {
    const a = await deriveUUID('Graph', ATTRIBUTES);
    const b = await deriveUUID('Graph', { ...ATTRIBUTES, namespace: 'other' });
    expect(a).not.toBe(b);
  });

  it('emits RFC-compatible UUIDv8/version and variant bits', async () => {
    const value = await deriveUUID('Graph', ATTRIBUTES);
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('rejects an empty domain class', async () => {
    await expect(deriveUUID('   ', ATTRIBUTES)).rejects.toThrow('UUID_DERIVE_DOMAIN_CLASS_REQUIRED');
  });

  it('publishes a revision for receipts/reports', () => {
    expect(UUID_DERIVATION_REVISION).toBe('atlas.uuid.derive.sha256-canonical-json-uuidv8.v1');
  });
});

describe('randomUUIDv7', () => {
  it('emits RFC-compatible UUIDv7 version and variant bits', () => {
    const value = randomUUIDv7();
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is never equal across two calls (random tail)', () => {
    const a = randomUUIDv7();
    const b = randomUUIDv7();
    expect(a).not.toBe(b);
  });

  it('encodes the supplied timestamp in the leading 48 bits, big-endian', () => {
    const ms = Date.UTC(2026, 0, 1, 0, 0, 0, 0); // 2026-01-01T00:00:00.000Z
    const value = randomUUIDv7(ms);
    const hex = value.replaceAll('-', '');
    const decoded = Number(BigInt(`0x${hex.slice(0, 12)}`));
    expect(decoded).toBe(ms);
  });

  it('is monotonically non-decreasing in its timestamp prefix for increasing input', () => {
    const a = randomUUIDv7(1_700_000_000_000);
    const b = randomUUIDv7(1_700_000_000_001);
    expect(a.slice(0, 12) <= b.slice(0, 12)).toBe(true);
  });

  it('never collides with deriveUUID output shape (v7 vs v8 version nibble differs)', async () => {
    const v7 = randomUUIDv7();
    const v8 = await deriveUUID('Graph', ATTRIBUTES);
    expect(v7.charAt(14)).toBe('7');
    expect(v8.charAt(14)).toBe('8');
  });
});
