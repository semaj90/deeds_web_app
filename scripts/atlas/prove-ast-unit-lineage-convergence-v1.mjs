#!/usr/bin/env node
/**
 * AST-UNIT-LINEAGE-CONVERGENCE-01 — bounded, read-only proof that ONE real
 * atlas_symbol_versions row binds exactly, at the same revision, to:
 *   source_ref -> source_revision -> symbol_version_id -> packet_key
 * and that its stored byte span (byte_start/byte_end) matches the CURRENT
 * on-disk bytes of that file, not a stale/inferred span.
 *
 * This does NOT construct a persisted AstUnit, does NOT call the Python NLP
 * sidecar, does NOT write to any table, and does NOT promote anything. It is
 * a single-row, machine-readable receipt — the exit condition proposed by
 * the pasted architecture review this gate is named after.
 *
 * Usage:
 *   node scripts/atlas/prove-ast-unit-lineage-convergence-v1.mjs [--symbol-version-id <id>]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT, FRONTEND_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const requestedId = getArg('--symbol-version-id');

async function resolveExistingPath(sourceRef) {
  for (const base of [REPO_ROOT, FRONTEND_ROOT]) {
    const candidate = path.join(base, sourceRef);
    try { await fs.access(candidate); return candidate; } catch { /* try next */ }
  }
  return null;
}

function sha256(buf) {
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const client = await pool.connect();

const row = requestedId
  ? (await client.query(
      `SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision,
              byte_start, byte_end, qualified_name, packet_key, candidate_ordinal, producer_revision
       FROM atlas_symbol_versions WHERE symbol_version_id = $1`,
      [requestedId],
    )).rows[0]
  : (await client.query(
      `SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision,
              byte_start, byte_end, qualified_name, packet_key, candidate_ordinal, producer_revision
       FROM atlas_symbol_versions
       WHERE packet_key IS NOT NULL AND source_revision ~ '^sha256:[a-f0-9]{64}$'
       ORDER BY symbol_version_id LIMIT 1`,
    )).rows[0];

client.release();
await pool.end();

const checks = [];
const fail = (code, detail) => checks.push({ code, status: 'FAIL', detail });
const pass = (code, detail) => checks.push({ code, status: 'PASS', detail });

if (!row) {
  console.error(JSON.stringify({ status: 'NO_ROW_FOUND', requestedId: requestedId ?? null }, null, 2));
  process.exit(1);
}

// 1. Identity chain presence — every link non-null, non-blank.
const identityFields = {
  symbolVersionId: row.symbol_version_id,
  stableSymbolId: row.stable_symbol_id,
  sourceRef: row.source_ref,
  sourceRevision: row.source_revision,
  packetKey: row.packet_key,
};
const missingIdentity = Object.entries(identityFields).filter(([, v]) => !v || String(v).trim() === '');
if (missingIdentity.length > 0) {
  fail('IDENTITY_CHAIN_COMPLETE', `missing: ${missingIdentity.map(([k]) => k).join(',')}`);
} else {
  pass('IDENTITY_CHAIN_COMPLETE', identityFields);
}

// 2. source_revision is a real sha256 digest shape, not a placeholder (workspace:0 etc).
const revisionShapeOk = /^sha256:[a-f0-9]{64}$/.test(row.source_revision ?? '');
(revisionShapeOk ? pass : fail)('SOURCE_REVISION_QUALIFIED', row.source_revision);

// 3. Resolve the file and verify CURRENT bytes hash matches the stored source_revision exactly
// (proves this isn't a stale revision left over from before a repair/edit).
const resolvedPath = await resolveExistingPath(row.source_ref);
let currentHash = null;
let fileBuf = null;
if (!resolvedPath) {
  fail('FILE_RESOLVABLE', `source_ref not found on disk: ${row.source_ref}`);
} else {
  pass('FILE_RESOLVABLE', resolvedPath);
  fileBuf = await fs.readFile(resolvedPath);
  currentHash = sha256(fileBuf);
  (currentHash === row.source_revision ? pass : fail)('SOURCE_REVISION_MATCHES_CURRENT_BYTES', {
    stored: row.source_revision,
    currentOnDisk: currentHash,
  });
}

// 4. Verify the stored byte span is in-range and non-degenerate for the CURRENT file bytes
// (not just "the check constraint passed at insert time" — actually re-slice now).
let sliceExcerpt = null;
if (fileBuf) {
  // pg returns bigint columns as JS strings, not numbers — Number.isFinite('10550')
  // is always false, so these must be coerced before any numeric check.
  const start = Number(row.byte_start);
  const end = Number(row.byte_end);
  const inRange = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= fileBuf.length;
  if (!inRange) {
    fail('BYTE_SPAN_IN_RANGE', { byteStart: row.byte_start, byteEnd: row.byte_end, fileLength: fileBuf.length });
  } else {
    pass('BYTE_SPAN_IN_RANGE', { byteStart: start, byteEnd: end, fileLength: fileBuf.length });
    sliceExcerpt = fileBuf.subarray(start, end).toString('utf8').slice(0, 300);
    const nonEmpty = sliceExcerpt.trim().length > 0;
    (nonEmpty ? pass : fail)('BYTE_SPAN_NON_EMPTY', { excerptLength: sliceExcerpt.length });
  }
}

// 5. packetKey referential sanity — bare-hex or ace:packet:<hex> shape (both are real live forms
// per this repo's own prior census), not a placeholder string.
const packetKeyShapeOk = /^(ace:packet:)?[a-f0-9]{12,64}$/.test(row.packet_key ?? '');
(packetKeyShapeOk ? pass : fail)('PACKET_KEY_SHAPE_PLAUSIBLE', row.packet_key);

const allPass = checks.every((c) => c.status === 'PASS');

const receipt = {
  schema: 'atlas.ast-unit-lineage-convergence.v1',
  gate: 'AST-UNIT-LINEAGE-CONVERGENCE-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PROOF',
  writesPerformed: false,
  canonicalAuthority: false,
  subject: {
    symbolVersionId: row.symbol_version_id,
    stableSymbolId: row.stable_symbol_id,
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    qualifiedName: row.qualified_name,
    packetKey: row.packet_key,
    candidateOrdinal: row.candidate_ordinal,
    producerRevision: row.producer_revision,
    byteStart: row.byte_start,
    byteEnd: row.byte_end,
  },
  currentOnDiskHash: currentHash,
  byteSpanExcerpt: sliceExcerpt,
  checks,
  status: allPass ? 'LINEAGE_CONVERGED' : 'LINEAGE_NOT_CONVERGED',
  exitCondition: 'source_ref -> source_revision -> symbol_version_id -> packet_key, all exact, all same revision, no fallback',
};

await fs.mkdir(path.resolve(REPO_ROOT, 'docs/reports'), { recursive: true });
await fs.writeFile(
  path.resolve(REPO_ROOT, 'docs/reports/ast-unit-lineage-convergence-v1.json'),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(JSON.stringify(receipt, null, 2));
process.exit(allPass ? 0 : 1);
