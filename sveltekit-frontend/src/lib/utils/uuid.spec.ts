import { describe, expect, it } from 'vitest';
import {
  UUID_DERIVATION_REVISION,
  canonicalUUIDDerivationInput,
  deriveUUID,
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
