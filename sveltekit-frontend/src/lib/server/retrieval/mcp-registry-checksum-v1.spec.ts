import { describe, expect, it } from 'vitest';
import {
  canonicalJsonStringify,
  sha256Hex,
  sha256OfValue,
  deriveServerAuthorityId,
  canonicalizeJsonSchema,
  schemaDigest,
} from './mcp-registry-checksum-v1.js';

describe('canonicalJsonStringify', () => {
  it('produces identical output regardless of object key order', () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, c: { y: 2, z: 1 }, b: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });

  it('preserves array order (order is semantic, not sorted)', () => {
    const a = { list: [3, 1, 2] };
    const b = { list: [1, 2, 3] };
    expect(canonicalJsonStringify(a)).not.toBe(canonicalJsonStringify(b));
  });

  it('sorts keys inside array elements', () => {
    const a = [{ b: 1, a: 2 }];
    const b = [{ a: 2, b: 1 }];
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
  });
});

describe('sha256Hex / sha256OfValue', () => {
  it('is a real 64-hex-char sha256 digest, deterministic for the same input', () => {
    const digest = sha256Hex('hello');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Hex('hello')).toBe(digest);
  });

  it('sha256OfValue is key-order independent (uses canonicalJsonStringify)', () => {
    const a = sha256OfValue({ b: 1, a: 2 });
    const b = sha256OfValue({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('produces different digests for different content', () => {
    expect(sha256OfValue({ a: 1 })).not.toBe(sha256OfValue({ a: 2 }));
  });
});

describe('deriveServerAuthorityId', () => {
  it('derives a stable, readable alias plus a distinct sha256 fingerprint', () => {
    const result = deriveServerAuthorityId({
      logicalServerKey: 'atlas-tools',
      transportType: 'stdio',
      endpointOrSocket: 'stdio:sveltekit-frontend/src/mcp/server.ts',
      trustPolicyIdentity: 'internal-first-party',
    });
    expect(result.serverAuthorityId).toBe('parent-atlas:mcp:atlas-tools');
    expect(result.serverAuthorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      logicalServerKey: 'trace',
      transportType: 'streamable-http' as const,
      endpointOrSocket: 'http://localhost:8788',
      trustPolicyIdentity: 'internal-first-party',
    };
    expect(deriveServerAuthorityId(input)).toEqual(deriveServerAuthorityId(input));
  });

  it('produces different fingerprints for different transports even with the same logical key', () => {
    const stdio = deriveServerAuthorityId({
      logicalServerKey: 'trace',
      transportType: 'stdio',
      endpointOrSocket: 'stdio:x',
      trustPolicyIdentity: 'internal-first-party',
    });
    const http = deriveServerAuthorityId({
      logicalServerKey: 'trace',
      transportType: 'streamable-http',
      endpointOrSocket: 'http://localhost:8788',
      trustPolicyIdentity: 'internal-first-party',
    });
    expect(stdio.serverAuthorityFingerprint).not.toBe(http.serverAuthorityFingerprint);
    // Alias is the same (shared logical identity across TRACE's two transports, per the
    // confirmed decision for this gate) -- only the fingerprint differs.
    expect(stdio.serverAuthorityId).toBe(http.serverAuthorityId);
  });

  it('rejects an empty logical server key', () => {
    expect(() => deriveServerAuthorityId({
      logicalServerKey: '   ',
      transportType: 'stdio',
      endpointOrSocket: 'x',
      trustPolicyIdentity: 'x',
    })).toThrow('MCP_SERVER_AUTHORITY_LOGICAL_KEY_REQUIRED');
  });
});

describe('canonicalizeJsonSchema / schemaDigest', () => {
  it('sorts object keys and required arrays deterministically', () => {
    const a = { type: 'object', required: ['b', 'a'], properties: { b: { type: 'string' }, a: { type: 'number' } } };
    const b = { properties: { a: { type: 'number' }, b: { type: 'string' } }, required: ['a', 'b'], type: 'object' };
    expect(canonicalizeJsonSchema(a)).toEqual(canonicalizeJsonSchema(b));
    expect(schemaDigest(a)).toBe(schemaDigest(b));
  });

  it('is a real sha256 digest', () => {
    expect(schemaDigest({ type: 'string' })).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different digests for genuinely different schemas', () => {
    expect(schemaDigest({ type: 'string' })).not.toBe(schemaDigest({ type: 'number' }));
  });

  it('does not silently include an annotations field if a caller mistakenly passes the whole tool def', () => {
    // This module has no special-case removal of `annotations` -- the contract is that callers
    // must pass ONLY the schema object, never the tool definition. Prove that if a caller does
    // pass annotations alongside the schema, the digest genuinely changes (so this is detectable
    // in review/tests, not silently ignored) -- callers are responsible for never doing this.
    const schemaOnly = schemaDigest({ type: 'object', properties: {} });
    const withAnnotations = schemaDigest({ type: 'object', properties: {}, annotations: { readOnlyHint: true } });
    expect(schemaOnly).not.toBe(withAnnotations);
  });
});
