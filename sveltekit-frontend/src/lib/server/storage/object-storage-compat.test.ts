// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildObjectStorageCompatibilityFields,
  hasObjectStorageKeyConflict,
  resolveObjectStorageKey,
} from './object-storage-compat.js';

describe('object-storage-compat', () => {
  it('prefers canonical objectStorageKey over legacy minioKey', () => {
    expect(
      resolveObjectStorageKey({
        objectStorageKey: 'canonical/path.pdf',
        minioKey: 'legacy/path.pdf',
      })
    ).toBe('canonical/path.pdf');
  });

  it('falls back to legacy minioKey when canonical key is absent', () => {
    expect(
      resolveObjectStorageKey({
        minioKey: 'legacy/path.pdf',
      })
    ).toBe('legacy/path.pdf');
  });

  it('detects conflicting canonical and legacy values', () => {
    expect(
      hasObjectStorageKeyConflict({
        objectStorageKey: 'canonical/path.pdf',
        minioKey: 'legacy/path.pdf',
      })
    ).toBe(true);
  });

  it('builds dual-write compatibility fields by default', () => {
    expect(buildObjectStorageCompatibilityFields('canonical/path.pdf')).toEqual({
      objectStorageKey: 'canonical/path.pdf',
      minioKey: 'canonical/path.pdf',
    });
  });

  it('can suppress legacy minioKey writes', () => {
    expect(
      buildObjectStorageCompatibilityFields('canonical/path.pdf', {
        writeLegacyMinioKey: false,
      })
    ).toEqual({
      objectStorageKey: 'canonical/path.pdf',
      minioKey: null,
    });
  });
});
