#!/usr/bin/env -S npx tsx
/**
 * operator-token-cli-v1 — out-of-band issuance and revocation for the ops.* operator token (option a).
 *
 * Run by the operator, never by MCP or the model. Registry location comes from
 * OPS_OPERATOR_REGISTRY_PATH and must resolve OUTSIDE the repository. Only SHA-256 hashes are stored;
 * a secret is printed once at issuance and cannot be recovered afterwards.
 *
 * Usage (from sveltekit-frontend/):
 *   npx tsx ../scripts/atlas/operator-token-cli-v1.mts issue --id op-1 --scopes ops.propose_patch --ttl-hours 24 --issued-by james
 *   npx tsx ../scripts/atlas/operator-token-cli-v1.mts revoke --id op-1
 *   npx tsx ../scripts/atlas/operator-token-cli-v1.mts list
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  issueToken,
  readRegistry,
  resolveRegistryPath,
  revokeToken,
} from '../../sveltekit-frontend/src/lib/server/mcp/operator-token-cli-logic-v1';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    if (!key?.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    flags[key.slice(2)] = rest[i + 1] ?? '';
  }
  return { command, flags };
}

function main(): void {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const file = resolveRegistryPath(process.env, REPO_ROOT);
  if (command === 'issue') {
    const { secret, record } = issueToken(file, {
      id: flags.id ?? '',
      scopes: (flags.scopes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      ttlHours: Number(flags['ttl-hours'] ?? '24'),
      issuedBy: flags['issued-by'] ?? '',
    });
    console.log(JSON.stringify({ status: 'ISSUED', id: record.id, scopes: record.scopes, expiresAt: record.expiresAt, token: secret, note: 'shown once; store it now' }, null, 2));
  } else if (command === 'revoke') {
    const record = revokeToken(file, flags.id ?? '');
    console.log(JSON.stringify({ status: 'REVOKED', id: record.id }, null, 2));
  } else if (command === 'list') {
    const rows = readRegistry(file).map(({ id, scopes, expiresAt, revoked, issuedBy }) => ({ id, scopes, expiresAt, revoked, issuedBy }));
    console.log(JSON.stringify(rows, null, 2));
  } else {
    throw new Error('usage: issue|revoke|list');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (err) {
    console.error(`OPERATOR_TOKEN_CLI_ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
