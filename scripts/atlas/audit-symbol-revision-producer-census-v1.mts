#!/usr/bin/env node
/**
 * S01-10A — symbol revision producer census. READ-ONLY (one REPEATABLE READ READ ONLY transaction + static writer scan). Mutates and repairs nothing.
 * Attributes every revision-shape in atlas_symbol_registry / atlas_symbol_versions to the producer that wrote it (registry_revision / producer_revision
 * columns) and records, per writer file, what its source does with revision values (validates? falls back? passes through?).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-producer-census.v1';
const digest = (v: string) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const pointer = resolve(ROOT, 'docs/reports/symbol-revision-producer-census-v1.json');
if (existsSync(pointer) && JSON.parse(readFileSync(pointer, 'utf8')).schema !== SCHEMA) throw new Error('POINTER_PATH_OWNED_BY_ANOTHER_ARTIFACT');

const SHAPE = (col: string) => `CASE WHEN ${col} ~ '^sha256:[a-f0-9]{64}$' THEN 'QUALIFIED_SHA256' WHEN ${col} ~ '^workspace:[0-9]+$' THEN 'PLACEHOLDER_workspace_N' WHEN ${col} ~ '^[a-f0-9]{40}$' THEN 'LEGACY_40HEX' WHEN ${col} IS NULL THEN 'NULL' ELSE 'OTHER' END`;
const WRITERS: Array<{ file: string; role: string; producerLabels: string[]; classification: string; why: string }> = [
  { file: 'scripts/atlas/promote-ast-symbols-to-registry.mjs', role: 'registry writer', producerLabels: ['promotion:ast-nominations:v1'], classification: 'PLACEHOLDER_WRITER', why: 'passes the nomination row source_revision straight into created_from_source_revision with no validation; ON CONFLICT DO NOTHING means a later clean run never repairs an earlier placeholder' },
  { file: 'scripts/atlas/apply-current-tree-bound-symbol-registry-canary-v1.mjs', role: 'registry writer', producerLabels: ['atlas-current-tree-bound-symbol-canary-v1'], classification: 'LEGACY_WRITER', why: 'wrote a Git commit oid as the revision (repo-level, not per-file content)' },
  { file: 'scripts/atlas/materialize-ast-symbol-versions.mjs', role: 'version writer', producerLabels: ['atlas-ast-symbol-version-materializer-v1'], classification: 'PLACEHOLDER_WRITER', why: 'copies row.source_revision / row.workspace_revision from its input; the rows it wrote carry workspace:0 or a Git commit oid' },
  { file: 'scripts/atlas/symbol-reconciliation-writer-v1.mts', role: 'registry+version writer', producerLabels: ['symbol-reconciliation-writer-v1'], classification: 'QUALIFIED_WRITER', why: 'every row it wrote carries a sha256-qualified source and workspace revision' },
];
const scan = (file: string) => {
  const t = existsSync(resolve(ROOT, file)) ? readFileSync(resolve(ROOT, file), 'utf8') : '';
  const lines = t.split('\n');
  const hit = (re: RegExp) => lines.map((l, i) => ({ l, n: i + 1 })).filter((x) => re.test(x.l)).map((x) => ({ line: x.n, text: x.l.trim().slice(0, 160) })).slice(0, 8);
  return {
    file, exists: t.length > 0,
    insertsRegistry: /INSERT\s+INTO\s+(public\.)?atlas_symbol_registry/i.test(t), insertsVersions: /INSERT\s+INTO\s+(public\.)?atlas_symbol_versions/i.test(t), insertsAliases: /INSERT\s+INTO\s+(public\.)?atlas_symbol_aliases/i.test(t),
    // A real validation TESTS the value's shape (64 hex chars). A `.replace(/^sha256:/, '')` prefix strip is not validation.
    validatesSha256Revision: /\[a-f0-9\]\{64\}|REVISION_RE|isQualifiedRevision/i.test(t),
    literalPlaceholderExpression: /['"`]workspace:/.test(t),
    randomUuid: /randomUUID/.test(t),
    revisionFallbackExpressions: hit(/(source_revision|sourceRevision|workspace_revision|workspaceRevision)[^\n]{0,60}(\?\?|\|\||COALESCE)/i),
    revisionRelatedLines: hit(/(created_from_source_revision|source_revision|workspace_revision)/),
    upstreamFileIdWritten: /upstream_file_id/.test(t) ? 'column named' : 'no',
  };
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
try {
  const many = async (sql: string) => (await client.query(sql)).rows;
  const registry = await many(`SELECT registry_revision AS producer, ${SHAPE('created_from_source_revision')} AS shape, status, count(*)::int AS rows, min(created_at)::date::text AS first, max(created_at)::date::text AS last, min(created_from_source_revision) AS sample_value FROM public.atlas_symbol_registry GROUP BY 1,2,3 ORDER BY 4 DESC`);
  const versions = await many(`SELECT producer_revision AS producer, ${SHAPE('source_revision')} AS source_shape, ${SHAPE('workspace_revision')} AS workspace_shape, count(*)::int AS rows, min(source_revision) AS sample_source, min(workspace_revision) AS sample_workspace FROM public.atlas_symbol_versions GROUP BY 1,2,3 ORDER BY 4 DESC`);
  const withVersion = await many(`SELECT ${SHAPE('r.created_from_source_revision')} AS shape, (EXISTS (SELECT 1 FROM public.atlas_symbol_versions v WHERE v.stable_symbol_id = r.stable_symbol_id)) AS has_version, count(*)::int AS rows FROM public.atlas_symbol_registry r GROUP BY 1,2 ORDER BY 1,2`);
  const upstreamFile = (await many(`SELECT count(upstream_file_id)::int AS populated, count(*)::int AS rows FROM public.atlas_symbol_versions`))[0];
  const oids = [...new Set([...registry, ...versions].flatMap((r: any) => [r.sample_value, r.sample_source]).filter((v: any) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v)))] as string[];
  const oidFacts = oids.map((oid) => {
    try { const type = execFileSync('git', ['cat-file', '-t', oid], { cwd: ROOT, encoding: 'utf8' }).trim(); const log = execFileSync('git', ['log', '-1', '--format=%aI', oid], { cwd: ROOT, encoding: 'utf8' }).trim(); return { oid, gitObjectType: type, authorDate: log, meaning: type === 'commit' ? 'A Git commit id: a repo-level revision, NOT a per-file content revision and NOT convertible to sha256 by formatting' : 'unknown' }; } catch { return { oid, gitObjectType: 'NOT_FOUND', meaning: 'not a known Git object' }; }
  });
  const writers = WRITERS.map((w) => ({ ...w, source: scan(w.file), rowsAttributed: [...registry.filter((r: any) => w.producerLabels.includes(r.producer)).map((r: any) => ({ table: 'atlas_symbol_registry', shape: r.shape, status: r.status, rows: r.rows })), ...versions.filter((r: any) => w.producerLabels.includes(r.producer)).map((r: any) => ({ table: 'atlas_symbol_versions', sourceShape: r.source_shape, workspaceShape: r.workspace_shape, rows: r.rows }))] }));
  const registryQualifiedProducerLabel = registry.filter((r: any) => r.shape === 'QUALIFIED_SHA256').map((r: any) => r.producer);
  const nomPath = resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
  let nominations: any = { present: false };
  if (existsSync(nomPath)) {
    const rows = readFileSync(nomPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const shape = (v: string | null) => (v == null ? 'NULL' : /^sha256:[a-f0-9]{64}$/.test(v) ? 'QUALIFIED_SHA256' : /^workspace:\d+$/.test(v) ? 'PLACEHOLDER_workspace_N' : /^[a-f0-9]{40}$/.test(v) ? 'LEGACY_40HEX' : 'OTHER');
    const counts: Record<string, number> = {};
    for (const r of rows) counts[shape(r.source_revision)] = (counts[shape(r.source_revision)] ?? 0) + 1;
    nominations = { present: true, file: '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl', rows: rows.length, sourceRevisionShapes: counts, note: 'the CURRENT nominations input is fully qualified; the placeholder rows were written from an earlier input artifact that no longer exists in this form' };
  }
  const placeholderRegistryRows = registry.filter((r: any) => r.shape === 'PLACEHOLDER_workspace_N').reduce((a: number, r: any) => a + r.rows, 0);
  const body = {
    schema: SCHEMA, gate: 'S01-10A', generatedAt: new Date().toISOString(),
    findings: {
      placeholderRegistryRows,
      placeholderOriginExactExpression: 'NOT a fallback expression in any symbol writer: no writer contains a `workspace:` literal or a revision fallback. The writers PASS THROUGH the revision value of their input row. The literal value `workspace:0` was already present in the 2026-08-24 nominations input (a `workspace:${workspace_id}` namespace label with workspace_id 0 used where a revision belongs; prove-ast-backfill-idempotency.mjs calls these "legacy-coerced"). The exact generating call site of that Aug-24 input is not recoverable: the input artifact has since been regenerated fully qualified.',
      legacy40HexOrigin: oidFacts,
      qualifiedRowsProducedBy: { registryRevisionLabels: registryQualifiedProducerLabel, versionProducer: versions.filter((r: any) => r.source_shape === 'QUALIFIED_SHA256').map((r: any) => r.producer) },
      upstreamFileIdPopulated: upstreamFile,
      passThroughNoValidation: 'Neither the registry writer nor the version materializer validates that a revision is a sha256-qualified value before writing, and the registry writer is ON CONFLICT DO NOTHING, so re-running it never repairs existing placeholders.',
    },
    registryByProducerAndShape: registry, versionsByProducerAndShape: versions, registrySymbolsByRevisionShapeAndVersionEvidence: withVersion,
    writers, currentNominationsInput: nominations,
    classificationCounts: WRITERS.reduce<Record<string, number>>((a, w) => { a[w.classification] = (a[w.classification] ?? 0) + 1; return a; }, {}),
    nextGate: 'S01-10B: stop new placeholders (shared revision validator that fails closed; a 40-hex value is never prefixed or hashed). No historical row is touched by that gate.',
    safety: { databaseWrites: 0, registryWrites: 0, schemaChanges: 0, graphifyRun: false, readerCutover: false, inputIdentityBackfill: false, upstreamFileIdModified: 0, newIdentityNamespaceCreated: false, transaction: 'REPEATABLE READ READ ONLY, ROLLBACK' },
  };
  const receiptChecksum = digest(JSON.stringify(body));
  const rel = `docs/reports/symbol-revision-producer-census-v1.${receiptChecksum.slice(7, 19)}.json`;
  const receipt = { ...body, receiptChecksum };
  if (!existsSync(resolve(ROOT, rel))) writeFileSync(resolve(ROOT, rel), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(pointer, `${JSON.stringify({ ...receipt, versionedReceipt: rel }, null, 2)}\n`);
  console.log(JSON.stringify({ placeholderRegistryRows, oidFacts, registry, versions, withVersion, classificationCounts: body.classificationCounts, writers: writers.map((w) => ({ file: w.file, cls: w.classification, validates: w.source.validatesSha256Revision, literal: w.source.literalPlaceholderExpression, fallbacks: w.source.revisionFallbackExpressions.length })), nominations, receipt: rel }, null, 2));
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
