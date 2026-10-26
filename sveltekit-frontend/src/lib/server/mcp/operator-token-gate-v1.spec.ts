import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateOperatorTokenV1,
  hashOperatorToken,
  loadOperatorTokenRegistryV1,
  parseOperatorTokenRegistryV1,
  type OperatorTokenRecordV1,
} from './operator-token-gate-v1.js';

const NOW = new Date('2026-10-11T12:00:00Z');
const SECRET = 'correct-horse-battery-staple-test-only';

function record(overrides: Partial<OperatorTokenRecordV1> = {}): OperatorTokenRecordV1 {
  return {
    id: 'op-1',
    tokenHash: hashOperatorToken(SECRET),
    scopes: ['ops.propose_patch'],
    expiresAt: '2027-01-01T00:00:00Z',
    revoked: false,
    issuedBy: 'local-cli',
    ...overrides,
  };
}

function run(overrides: Partial<Parameters<typeof evaluateOperatorTokenV1>[0]> = {}) {
  return evaluateOperatorTokenV1({
    presentedToken: SECRET,
    tool: 'ops.propose_patch',
    now: NOW,
    registry: [record()],
    ...overrides,
  });
}

describe('evaluateOperatorTokenV1', () => {
  it('denies everything when no registry is available (deny by default)', () => {
    expect(run({ registry: null }).reasonCode).toBe('REGISTRY_UNAVAILABLE');
  });

  it('refuses missing and blank tokens', () => {
    expect(run({ presentedToken: undefined }).reasonCode).toBe('MISSING_TOKEN');
    expect(run({ presentedToken: '' }).reasonCode).toBe('MISSING_TOKEN');
    expect(run({ presentedToken: '   ' }).reasonCode).toBe('MISSING_TOKEN');
  });

  it('refuses the fake non-empty token that passed the current requireToken gate', () => {
    const decided = run({ presentedToken: 'not-an-operator' });
    expect(decided.allowed).toBe(false);
    expect(decided.reasonCode).toBe('UNKNOWN_TOKEN');
  });

  it('refuses revoked, expired, and out-of-scope tokens', () => {
    expect(run({ registry: [record({ revoked: true })] }).reasonCode).toBe('REVOKED');
    expect(run({ registry: [record({ expiresAt: '2026-10-11T11:59:59Z' })] }).reasonCode).toBe('EXPIRED');
    expect(run({ tool: 'ops.run_quality_gate' }).reasonCode).toBe('SCOPE_DENIED');
  });

  it('allows a valid, scoped, unexpired token and reports only the token id', () => {
    const decided = run();
    expect(decided.allowed).toBe(true);
    expect(decided.reasonCode).toBe('ALLOWED');
    expect(decided.tokenId).toBe('op-1');
    expect(JSON.stringify(decided)).not.toContain(SECRET);
  });

  it('refuses a replayed single-use nonce', () => {
    const decided = run({ nonce: 'n-1', usedNonces: new Set(['n-1']) });
    expect(decided.reasonCode).toBe('REPLAYED_NONCE');
    expect(run({ nonce: 'n-2', usedNonces: new Set(['n-1']) }).allowed).toBe(true);
  });

  it('is never authoritative', () => {
    expect(run().canonicalAuthority).toBe(false);
    expect(run({ registry: null }).canonicalAuthority).toBe(false);
  });
});

describe('parseOperatorTokenRegistryV1', () => {
  it('accepts a well-formed registry', () => {
    expect(parseOperatorTokenRegistryV1([record()])).toHaveLength(1);
  });

  it('rejects raw-looking hashes, duplicate ids, bad expiry, and non-array input', () => {
    expect(() => parseOperatorTokenRegistryV1([record({ tokenHash: SECRET })])).toThrow('OPERATOR_REGISTRY_HASH_INVALID');
    expect(() => parseOperatorTokenRegistryV1([record(), record()])).toThrow('OPERATOR_REGISTRY_DUPLICATE_ID');
    expect(() => parseOperatorTokenRegistryV1([record({ expiresAt: 'soon' })])).toThrow('OPERATOR_REGISTRY_EXPIRY_INVALID');
    expect(() => parseOperatorTokenRegistryV1({})).toThrow('OPERATOR_REGISTRY_NOT_ARRAY');
  });
});

describe('loadOperatorTokenRegistryV1', () => {
  it('returns null for an absent file and parses a present one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-gate-'));
    try {
      expect(loadOperatorTokenRegistryV1(path.join(dir, 'missing.json'))).toBeNull();
      const file = path.join(dir, 'registry.json');
      fs.writeFileSync(file, JSON.stringify([record()]));
      expect(loadOperatorTokenRegistryV1(file)?.[0].id).toBe('op-1');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
