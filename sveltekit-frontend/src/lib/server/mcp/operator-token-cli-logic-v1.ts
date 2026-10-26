import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  hashOperatorToken,
  parseOperatorTokenRegistryV1,
  type OperatorTokenRecordV1,
} from './operator-token-gate-v1';

/**
 * Issuance and revocation logic for the operator token (option a). Used by the operator CLI
 * (scripts/atlas/operator-token-cli-v1.mts). Never imported by MCP tool code.
 */

export function resolveRegistryPath(env: NodeJS.ProcessEnv, repoRoot: string): string {
  const raw = env.OPS_OPERATOR_REGISTRY_PATH;
  if (!raw || raw.trim() === '') throw new Error('OPS_OPERATOR_REGISTRY_PATH is not set');
  const abs = path.resolve(raw);
  const rel = path.relative(path.resolve(repoRoot), abs);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error('OPS_OPERATOR_REGISTRY_PATH must resolve outside the repository');
  }
  return abs;
}

export function readRegistry(file: string): OperatorTokenRecordV1[] {
  if (!fs.existsSync(file)) return [];
  return parseOperatorTokenRegistryV1(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Atomic replace: write a sibling temp file, then rename over the target. Never deletes. */
export function writeRegistry(file: string, records: OperatorTokenRecordV1[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function issueToken(file: string, opts: {
  id: string;
  scopes: string[];
  ttlHours: number;
  issuedBy: string;
  now?: Date;
}): { secret: string; record: OperatorTokenRecordV1 } {
  if (!opts.id.trim()) throw new Error('--id is required');
  if (opts.scopes.length === 0) throw new Error('--scopes is required');
  if (!(opts.ttlHours > 0 && opts.ttlHours <= 24 * 30)) throw new Error('--ttl-hours must be in (0, 720]');
  const records = readRegistry(file);
  if (records.some((r) => r.id === opts.id)) throw new Error(`id already exists: ${opts.id}`);
  const secret = randomBytes(32).toString('base64url');
  const now = opts.now ?? new Date();
  const record: OperatorTokenRecordV1 = {
    id: opts.id,
    tokenHash: hashOperatorToken(secret),
    scopes: opts.scopes,
    expiresAt: new Date(now.getTime() + opts.ttlHours * 3600_000).toISOString(),
    revoked: false,
    issuedBy: opts.issuedBy,
  };
  writeRegistry(file, [...records, record]);
  return { secret, record };
}

export function revokeToken(file: string, id: string): OperatorTokenRecordV1 {
  const records = readRegistry(file);
  const index = records.findIndex((r) => r.id === id);
  if (index < 0) throw new Error(`unknown id: ${id}`);
  if (records[index].revoked) throw new Error(`already revoked: ${id}`);
  records[index] = { ...records[index], revoked: true };
  writeRegistry(file, records);
  return records[index];
}
