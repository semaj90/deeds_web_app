import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateOperatorTokenV1,
  loadOperatorTokenRegistryV1,
} from './operator-token-gate-v1.js';
import {
  issueToken,
  resolveRegistryPath,
  revokeToken,
} from './operator-token-cli-logic-v1';

const NOW = new Date('2026-10-11T12:00:00Z');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-cli-'));
  file = path.join(dir, 'registry.json');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveRegistryPath', () => {
  it('refuses an unset variable and any path inside the repository', () => {
    expect(() => resolveRegistryPath({}, REPO_ROOT)).toThrow('is not set');
    expect(() => resolveRegistryPath({ OPS_OPERATOR_REGISTRY_PATH: path.join(REPO_ROOT, 'reg.json') }, REPO_ROOT))
      .toThrow('outside the repository');
    expect(() => resolveRegistryPath({ OPS_OPERATOR_REGISTRY_PATH: REPO_ROOT }, REPO_ROOT))
      .toThrow('outside the repository');
  });

  it('accepts a path outside the repository', () => {
    expect(resolveRegistryPath({ OPS_OPERATOR_REGISTRY_PATH: file }, REPO_ROOT)).toBe(path.resolve(file));
  });
});

describe('issueToken', () => {
  it('stores only a hash, and the printed secret passes the gate end to end', () => {
    const { secret, record } = issueToken(file, {
      id: 'op-1', scopes: ['ops.propose_patch'], ttlHours: 24, issuedBy: 'test', now: NOW,
    });
    const onDisk = fs.readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(secret);
    expect(onDisk).toContain(record.tokenHash);

    const registry = loadOperatorTokenRegistryV1(file);
    const decided = evaluateOperatorTokenV1({
      presentedToken: secret, tool: 'ops.propose_patch', now: NOW, registry,
    });
    expect(decided.allowed).toBe(true);
    expect(decided.tokenId).toBe('op-1');
  });

  it('refuses duplicate ids, empty scopes, and out-of-range TTLs', () => {
    issueToken(file, { id: 'op-1', scopes: ['ops.propose_patch'], ttlHours: 1, issuedBy: 'test', now: NOW });
    expect(() => issueToken(file, { id: 'op-1', scopes: ['ops.propose_patch'], ttlHours: 1, issuedBy: 'test', now: NOW }))
      .toThrow('id already exists');
    expect(() => issueToken(file, { id: 'op-2', scopes: [], ttlHours: 1, issuedBy: 'test', now: NOW }))
      .toThrow('--scopes is required');
    expect(() => issueToken(file, { id: 'op-3', scopes: ['x'], ttlHours: 0, issuedBy: 'test', now: NOW }))
      .toThrow('--ttl-hours');
  });

  it('expires tokens at the configured TTL', () => {
    const { secret } = issueToken(file, { id: 'op-1', scopes: ['ops.propose_patch'], ttlHours: 1, issuedBy: 'test', now: NOW });
    const later = new Date(NOW.getTime() + 2 * 3600_000);
    const decided = evaluateOperatorTokenV1({
      presentedToken: secret, tool: 'ops.propose_patch', now: later, registry: loadOperatorTokenRegistryV1(file),
    });
    expect(decided.reasonCode).toBe('EXPIRED');
  });
});

describe('revokeToken', () => {
  it('flips the revoked flag so the gate refuses the token immediately', () => {
    const { secret } = issueToken(file, { id: 'op-1', scopes: ['ops.propose_patch'], ttlHours: 24, issuedBy: 'test', now: NOW });
    revokeToken(file, 'op-1');
    const decided = evaluateOperatorTokenV1({
      presentedToken: secret, tool: 'ops.propose_patch', now: NOW, registry: loadOperatorTokenRegistryV1(file),
    });
    expect(decided.reasonCode).toBe('REVOKED');
    expect(() => revokeToken(file, 'op-1')).toThrow('already revoked');
    expect(() => revokeToken(file, 'nope')).toThrow('unknown id');
  });
});
