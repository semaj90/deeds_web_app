#!/usr/bin/env node

/**
 * Read-only AST hash-grain census.
 *
 * `source_content_hash` is being frozen as the SHA-256 of the complete raw
 * source file. `normalized_node_hash` remains the node-local structural hash.
 * This audit measures the existing rows against the admitted source-binding
 * digest and deliberately does not repair, supersede, or write AST rows.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const reportPath = path.join(REPO_ROOT, 'docs/reports/ast-hash-column-contract-v1.json');
const normalizeHash = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  return raw.startsWith('sha256:') ? raw : `sha256:${raw}`;
};
const normalizePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const checksum = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const atomicWrite = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch { /* already renamed */ }
  }
};

const contract = {
  sourceContentHashBasis: 'RAW_FILE_BYTES_SHA256',
  nodeHashBasis: 'NORMALIZED_NODE_V1',
  sourceTextEncodingRevision: 'SOURCE-TEXT-ENCODING-01',
  offsetBasis: 'UTF8_PARSER_BUFFER_V1',
  lineBasis: 'ONE_BASED_STORAGE',
  parserName: 'ast-grep-napi',
  parserVersion: '0.44.0',
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
});

let databaseError = null;
let rows = [];
try {
  const result = await pool.query(`
    SELECT
      a.relative_path,
      a.source_revision,
      a.parser_name,
      a.parser_version,
      a.grammar_version,
      a.source_content_hash,
      a.normalized_node_hash,
      a.start_byte,
      a.end_byte,
      b.content_digest AS admitted_content_digest
    FROM public.atlas_ast_nodes a
    LEFT JOIN (
      SELECT DISTINCT ON (lower(replace(canonical_source_ref, '\\\\', '/')))
        lower(replace(canonical_source_ref, '\\\\', '/')) AS normalized_source_ref,
        content_digest
      FROM public.atlas_workspace_source_bindings
      ORDER BY lower(replace(canonical_source_ref, '\\\\', '/')),
        workspace_revision DESC NULLS LAST
    ) b ON b.normalized_source_ref = lower(replace(a.relative_path, '\\\\', '/'))
    ORDER BY a.relative_path, a.source_revision NULLS FIRST, a.tree_node_id
  `);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const groups = new Map();
let wholeFileRawMatches = 0;
let missingBindingDigest = 0;
let legacyUnqualified = 0;
let hashGrainMismatch = 0;
let spanCoordinateRows = 0;

for (const row of rows) {
  const sourceRef = normalizePath(row.relative_path);
  const sourceRevision = String(row.source_revision ?? '').trim() || null;
  const key = JSON.stringify([sourceRef, sourceRevision, row.parser_name ?? null, row.parser_version ?? null]);
  const group = groups.get(key) ?? {
    sourceRef,
    sourceRevision,
    parserName: row.parser_name ?? null,
    parserVersion: row.parser_version ?? null,
    grammarVersions: new Set(),
    sourceContentHashes: new Set(),
    rowCount: 0,
    bindingDigest: normalizeHash(row.admitted_content_digest),
    matchingRows: 0,
  };
  group.rowCount += 1;
  group.sourceContentHashes.add(normalizeHash(row.source_content_hash));
  if (row.grammar_version) group.grammarVersions.add(row.grammar_version);
  if (normalizeHash(row.source_content_hash) && normalizeHash(row.source_content_hash) === group.bindingDigest) {
    group.matchingRows += 1;
    wholeFileRawMatches += 1;
  } else if (!group.bindingDigest) {
    missingBindingDigest += 1;
  } else {
    hashGrainMismatch += 1;
  }
  if (!sourceRevision) legacyUnqualified += 1;
  if (row.start_byte !== null || row.end_byte !== null) spanCoordinateRows += 1;
  groups.set(key, group);
}

const groupRows = [...groups.values()].map((group) => ({
  ...group,
  grammarVersions: [...group.grammarVersions].sort(),
  sourceContentHashes: [...group.sourceContentHashes].sort(),
  distinctSourceContentHashes: group.sourceContentHashes.size,
  wholeFileRawParity: Boolean(group.bindingDigest) && group.matchingRows === group.rowCount,
}));
const mixedHashGroups = groupRows.filter((group) => group.distinctSourceContentHashes > 1).length;
const wholeFileGroups = groupRows.filter((group) => group.wholeFileRawParity).length;
const status = databaseError
  ? 'AST_HASH_CONTRACT_DATABASE_READ_FAILED'
  : rows.length > 0
    && wholeFileRawMatches === rows.length
    && mixedHashGroups === 0
    && legacyUnqualified === 0
    ? 'AST_SOURCE_CONTENT_HASH_CONTRACT_PROVEN'
    : 'AST_SOURCE_CONTENT_HASH_CONTRACT_BLOCKED';

const report = {
  schema: 'atlas.ast-hash-column-contract.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_HASH_GRAIN_CENSUS',
  contract,
  status,
  databaseError,
  counts: {
    astRows: rows.length,
    sourceRevisionQualifiedRows: rows.length - legacyUnqualified,
    legacyUnqualifiedRows: legacyUnqualified,
    distinctSourceRevisionParserGroups: groupRows.length,
    wholeFileRawParityRows: wholeFileRawMatches,
    wholeFileRawParityGroups: wholeFileGroups,
    hashGrainMismatchRows: hashGrainMismatch,
    missingBindingDigestRows: missingBindingDigest,
    mixedHashGroups,
    spanCoordinateRows,
  },
  classifications: {
    wholeFileRaw: wholeFileRawMatches,
    legacyHashGrainMismatchOrUnknown: hashGrainMismatch,
    missingAdmittedBindingDigest: missingBindingDigest,
    legacyUnqualified: legacyUnqualified,
  },
  groups: groupRows.slice(0, 5000),
  nextGate: status === 'AST_SOURCE_CONTENT_HASH_CONTRACT_PROVEN'
    ? 'AST_ENCODING_COORDINATE_PROOF'
    : 'CLASSIFY_LEGACY_HASH_GRAIN_BEFORE_SUPERSESSION',
  canonicalAuthority: false,
  writesPerformed: false,
};
report.reportChecksum = checksum({ ...report, generatedAt: undefined, reportChecksum: undefined });
atomicWrite(reportPath, report);

console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  counts: report.counts,
  nextGate: report.nextGate,
  canonicalAuthority: false,
  writesPerformed: false,
  reportPath,
}, null, 2));

process.exitCode = databaseError ? 1 : 0;
