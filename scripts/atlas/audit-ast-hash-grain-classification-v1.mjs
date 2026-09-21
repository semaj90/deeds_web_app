#!/usr/bin/env node

/**
 * Read-only AST hash-grain classifier.
 *
 * `atlas_ast_nodes.source_content_hash` is not reinterpreted from length or
 * format. It is compared only with explicit whole-file and chunk hash columns
 * owned by existing tables. No rows, indexes, or authority state are changed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const reportPath = path.join(REPO_ROOT, 'docs/reports/ast-hash-grain-classification-v1.json');
const normalizeHash = (value) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  return raw.startsWith('sha256:') ? raw : `sha256:${raw}`;
};
const normalizePath = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const checksum = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const readText = (relativePath) => {
  try { return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'); } catch { return null; }
};
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

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
});

let rows = [];
let databaseError = null;
try {
  const result = await pool.query(`
    WITH ast AS (
      SELECT
        lower(replace(relative_path, '\\\\', '/')) AS normalized_path,
        lower(regexp_replace(trim(source_content_hash), '^sha256:', '')) AS ast_hash,
        count(*)::int AS ast_row_count,
        count(*) FILTER (WHERE source_revision IS NOT NULL AND length(trim(source_revision)) > 0)::int AS source_revision_rows,
        array_agg(DISTINCT coalesce(parser_name, '<null>') || '@' || coalesce(parser_version, '<null>')) AS producer_signatures
      FROM public.atlas_ast_nodes
      WHERE source_content_hash IS NOT NULL
        AND length(trim(source_content_hash)) > 0
      GROUP BY 1, 2
    ), bindings AS (
      SELECT DISTINCT ON (
        lower(CASE
          WHEN replace(canonical_source_ref, '\\\\', '/') LIKE 'sveltekit-frontend/src/%'
            THEN substring(replace(canonical_source_ref, '\\\\', '/') FROM length('sveltekit-frontend/') + 1)
          ELSE replace(canonical_source_ref, '\\\\', '/')
        END)
      )
        lower(CASE
          WHEN replace(canonical_source_ref, '\\\\', '/') LIKE 'sveltekit-frontend/src/%'
            THEN substring(replace(canonical_source_ref, '\\\\', '/') FROM length('sveltekit-frontend/') + 1)
          ELSE replace(canonical_source_ref, '\\\\', '/')
        END) AS normalized_path,
        lower(regexp_replace(trim(content_digest), '^sha256:', '')) AS binding_hash
      FROM public.atlas_workspace_source_bindings
      WHERE content_digest IS NOT NULL
      ORDER BY lower(CASE
          WHEN replace(canonical_source_ref, '\\\\', '/') LIKE 'sveltekit-frontend/src/%'
            THEN substring(replace(canonical_source_ref, '\\\\', '/') FROM length('sveltekit-frontend/') + 1)
          ELSE replace(canonical_source_ref, '\\\\', '/')
        END),
        workspace_revision DESC NULLS LAST
    ), chunk_hashes AS (
      SELECT
        lower(replace(relative_path, '\\\\', '/')) AS normalized_path,
        ast.ast_hash,
        bool_or(lower(regexp_replace(trim(file_content_hash), '^sha256:', '')) = ast.ast_hash) AS whole_file_match,
        bool_or(lower(regexp_replace(trim(content_hash), '^sha256:', '')) = ast.ast_hash) AS chunk_match,
        count(*) FILTER (WHERE content_hash_scope IS NOT NULL)::int AS scoped_rows,
        array_agg(DISTINCT content_hash_scope) FILTER (WHERE content_hash_scope IS NOT NULL) AS observed_scopes
      FROM public.codebase_chunk_index c
      JOIN ast ON ast.normalized_path = lower(replace(c.relative_path, '\\\\', '/'))
      GROUP BY 1, ast.ast_hash
    )
    SELECT
      ast.normalized_path,
      ast.ast_hash,
      ast.ast_row_count,
      ast.source_revision_rows,
      ast.producer_signatures,
      COALESCE(chunk_hashes.whole_file_match, false) AS whole_file_match,
      COALESCE(bindings.binding_hash = ast.ast_hash, false) AS binding_whole_file_match,
      COALESCE(chunk_hashes.chunk_match, false) AS chunk_match,
      COALESCE(chunk_hashes.scoped_rows, 0) AS scoped_rows,
      COALESCE(chunk_hashes.observed_scopes, ARRAY[]::text[]) AS observed_scopes
    FROM ast
    LEFT JOIN bindings
      ON bindings.normalized_path = ast.normalized_path
    LEFT JOIN chunk_hashes
      ON chunk_hashes.normalized_path = ast.normalized_path
     AND chunk_hashes.ast_hash = ast.ast_hash
    ORDER BY ast.normalized_path, ast.ast_hash
  `);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const classified = rows.map((row) => {
  const bindingWholeFile = row.binding_whole_file_match === true;
  const chunkTableWholeFile = row.whole_file_match === true;
  const wholeFile = bindingWholeFile || chunkTableWholeFile;
  const chunk = row.chunk_match === true;
  const classification = wholeFile && chunk
    ? 'BOTH'
    : wholeFile
      ? 'WHOLE_FILE_RAW'
      : chunk
        ? 'CHUNK_CONTENT'
        : 'UNKNOWN';
  return {
    path: row.normalized_path,
    astHash: normalizeHash(row.ast_hash),
    astRowCount: Number(row.ast_row_count ?? 0),
    sourceRevisionRows: Number(row.source_revision_rows ?? 0),
    producerSignatures: row.producer_signatures ?? [],
    classification,
    explicitWholeFileMatch: wholeFile,
    explicitBindingWholeFileMatch: bindingWholeFile,
    explicitChunkTableWholeFileMatch: chunkTableWholeFile,
    explicitChunkMatch: chunk,
    observedChunkHashScopes: row.observed_scopes ?? [],
  };
});

const byClassification = classified.reduce((counts, row) => {
  counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}, {});
const rowCounts = classified.reduce((counts, row) => {
  counts[row.classification] = (counts[row.classification] ?? 0) + row.astRowCount;
  return counts;
}, {});
const byProducer = new Map();
for (const row of classified) {
  for (const producer of row.producerSignatures) {
    const current = byProducer.get(producer) ?? { groups: 0, astRows: 0, unknownGroups: 0, unknownRows: 0, sourceRevisionRows: 0 };
    current.groups += 1;
    current.astRows += row.astRowCount;
    current.sourceRevisionRows += row.sourceRevisionRows;
    if (row.classification === 'UNKNOWN') {
      current.unknownGroups += 1;
      current.unknownRows += row.astRowCount;
    }
    byProducer.set(producer, current);
  }
}
const legacyAstMaterializer = readText('sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs');
const legacyAstPhase = legacyAstMaterializer?.split('// ── Upsert in batches')[0] ?? '';
const astWriter = readText('scripts/atlas/lib/atlas-ast-nodes-writer.mjs');
const graphifyExtractor = readText('scripts/atlas/graphify-symbol-extractor-v1.mts');
const producerContracts = [
  {
    producer: 'tree-sitter@chunk-index-v1',
    status: legacyAstPhase
      && legacyAstPhase.includes('file_content_hash,')
      && legacyAstPhase.includes('WHOLE_FILE_CONTENT_HASH_REQUIRED')
      && legacyAstPhase.includes('source_content_hash:  sourceContentHash')
      && !legacyAstPhase.includes("source_content_hash:  crypto.createHash('sha256').update(np).digest('hex')")
      && !legacyAstPhase.includes('const contentHash = row.content_hash')
      ? 'WHOLE_FILE_DIGEST_CONTRACT_WIRED'
      : legacyAstPhase
        && legacyAstPhase.includes("source_content_hash:  crypto.createHash('sha256').update(np).digest('hex')")
        && legacyAstPhase.includes('source_content_hash:  contentHash')
        ? 'LEGACY_MIXED_PATH_AND_CHUNK_HASH'
        : 'SOURCE_CONTRACT_NOT_CONFIRMED',
    source: 'sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs',
    rule: 'future file and symbol nodes require codebase_chunk_index.file_content_hash as the whole-file raw-byte digest; existing rows are not rewritten by this audit',
    canonicalAuthority: false,
  },
  {
    producer: 'ast-grep-napi@0.44.0',
    status: astWriter && graphifyExtractor
      && astWriter.includes('sourceContentDigest')
      && graphifyExtractor.includes('toAstNodeInputs(astNodes, row.content_hash)')
      ? 'WHOLE_FILE_DIGEST_CONTRACT_WIRED'
      : 'SOURCE_CONTRACT_NOT_CONFIRMED',
    source: 'scripts/atlas/lib/atlas-ast-nodes-writer.mjs',
    rule: 'source_content_hash receives explicit graphify_files.content_hash',
    canonicalAuthority: false,
  },
];
const report = {
  schema: 'atlas.ast-hash-grain-classification.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EXPLICIT_COLUMN_COMPARISON',
  input: {
    astTable: 'public.atlas_ast_nodes.source_content_hash',
    sourceRefPolicy: 'ACTIVE_APP_RELATIVE_V1',
    wholeFileBindingReference: 'public.atlas_workspace_source_bindings.content_digest',
    wholeFileReference: 'public.codebase_chunk_index.file_content_hash',
    chunkReference: 'public.codebase_chunk_index.content_hash',
  },
  status: databaseError
    ? 'AST_HASH_GRAIN_DATABASE_READ_FAILED'
    : classified.length > 0 && (byClassification.UNKNOWN ?? 0) === 0
      ? 'AST_HASH_GRAIN_CLASSIFIED_WITH_EXPLICIT_MATCHES'
      : 'AST_HASH_GRAIN_REVIEW_REQUIRED',
  databaseError,
  producerContracts,
  counts: {
    distinctPathHashGroups: classified.length,
    astRows: classified.reduce((sum, row) => sum + row.astRowCount, 0),
    byClassification,
    astRowsByClassification: rowCounts,
    byProducer: Object.fromEntries([...byProducer.entries()].sort(([a], [b]) => a.localeCompare(b))),
  },
  classifications: classified.slice(0, 5000),
  policy: {
    hashLengthOrFormatDoesNotEstablishGrain: true,
    onlyExplicitColumnParityEstablishesClassification: true,
    unknownAndMixedRemainReviewOnly: true,
    supersessionAuthorized: false,
    canonicalAuthority: false,
    writesPerformed: false,
  },
  nextGate: databaseError
    ? 'RETRY_HASH_GRAIN_READ'
    : (byClassification.UNKNOWN ?? 0) > 0
      ? 'REVIEW_UNKNOWN_HASH_GRAIN_BEFORE_SUPERSESSION'
      : 'REVIEW_EXPLICIT_HASH_GRAIN_CLASSIFICATION_BEFORE_SUPERSESSION',
  reportChecksum: null,
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
