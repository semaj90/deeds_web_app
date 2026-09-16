#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sqlArgIndex = process.argv.indexOf('--sql');
const sqlPath = sqlArgIndex >= 0 && process.argv[sqlArgIndex + 1]
  ? resolve(repoRoot, process.argv[sqlArgIndex + 1])
  : resolve(repoRoot, 'sveltekit-frontend', 'drizzle', 'manual', '20260824_graphify_file_search_bitmap_v1.sql');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'file-search-sidecar-disposable-proof-v1.json');
const suffix = `${process.pid}-${Date.now().toString(36)}`;
const container = `atlas-file-search-proof-${suffix}`;
const image = process.argv.includes('--image') ? process.argv[process.argv.indexOf('--image') + 1] || 'pgvector/pgvector:pg18' : 'pgvector/pgvector:pg18';

function run(command, args, input = undefined) {
  const result = spawnSync(command, args, { cwd: repoRoot, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function docker(args, input) { return run('docker', args, input); }
function psql(sql) { return docker(['exec', '-i', container, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'proof', '-d', 'proof'], sql); }

const sourceSql = readFileSync(sqlPath, 'utf8');
const sourceMismatches = {
  workspaceRevisionType: /workspace_revision\s+bigint/i.test(sourceSql) ? 'BIGINT' : null,
  generatedArrayToString: /GENERATED ALWAYS AS \([\s\S]*array_to_string\(/i.test(sourceSql),
};

// This is deliberately an in-memory compatibility variant. The repository SQL
// remains unchanged; the report records exactly which corrections were needed.
const correctedSql = /atlas_immutable_array_to_string\s*\(/i.test(sourceSql)
  ? sourceSql
  : `
CREATE OR REPLACE FUNCTION atlas_immutable_array_to_string(items text[], delimiter text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$ SELECT array_to_string(items, delimiter) $$;
${sourceSql.replace(/workspace_revision\s+bigint/gi, 'workspace_revision text').replace(/array_to_string\(/g, 'atlas_immutable_array_to_string(')}
`;

let created = false;
const startedAt = new Date().toISOString();
try {
  docker(['run', '-d', '--rm', '--name', container, '-e', 'POSTGRES_USER=proof', '-e', 'POSTGRES_PASSWORD=proof', '-e', 'POSTGRES_DB=proof', image]);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'proof', '-d', 'proof'], { encoding: 'utf8' });
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  if (!ready) throw new Error('DISPOSABLE_POSTGRES_NOT_READY');
  let applied = false;
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      psql('CREATE EXTENSION IF NOT EXISTS vector;');
      psql(correctedSql);
      applied = true;
      break;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  if (!applied) throw lastError ?? new Error('DISPOSABLE_POSTGRES_SQL_NOT_READY');
  const tables = psql(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'atlas_file_search_%' ORDER BY tablename;`).split(/\r?\n/).filter(Boolean);
  const indexes = psql(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'atlas_file_search_%' ORDER BY indexname;`).split(/\r?\n/).filter(Boolean);
  const report = {
    schema: 'atlas.file-search-sidecar-disposable-proof.v1',
    status: 'DISPOSABLE_CORRECTED_CONTRACT_PROVEN',
    sourceSql: sqlPath,
    sourceSha256: createHash('sha256').update(sourceSql).digest('hex'),
    sourceMismatches,
    correctedContract: { workspaceRevisionType: 'TEXT_SHA256_REVISION', immutableArrayToStringWrapper: true },
    disposableContainer: true,
    tables,
    indexes,
    liveMigrationAuthorized: false,
    writesPerformed: false,
    conclusion: 'The sidecar is executable only after the revision type and generated-tsvector immutability corrections are explicitly versioned and reviewed; this proof does not authorize live migration.',
    startedAt,
    completedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, reportPath }));
} finally {
  if (created) spawnSync('docker', ['rm', '-f', container], { cwd: repoRoot, encoding: 'utf8' });
}
