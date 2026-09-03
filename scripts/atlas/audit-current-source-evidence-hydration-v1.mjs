#!/usr/bin/env node

/** Read-only audit of exact content/evidence hydration for the clean source cohort. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortPath = path.join(root, 'docs/reports/current-source-cohort-lineage-v1.json');
const reportPath = path.join(root, 'docs/reports/current-source-evidence-hydration-v1.json');
const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
const bindings = (cohort.rows ?? []).filter((row) => row?.relativePath && row?.sourceRevision);
const normalize = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const refs = [...new Set(bindings.map((row) => normalize(row.relativePath)))];
const prefixedRefs = refs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);
const allRefs = [...new Set([...refs, ...prefixedRefs])];
const rawRefs = [...new Set(bindings.map((row) => String(row.relativePath).trim()))];
const rawPrefixedRefs = rawRefs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });

const report = {
  schema: 'atlas.current-source-evidence-hydration.v1',
  mode: 'READ_ONLY_SOURCE_EVIDENCE_OWNER_AUDIT',
  inputRows: bindings.length,
  exactRevisionMatches: 0,
  contentHydrated: 0,
  authoritativeNamespaces: 0,
  namespaceStatus: 'MISSING',
  evidenceSpanReady: 0,
  revisionBoundSpanOwner: 0,
  astCandidateRows: 0,
  astRevisionQualifiedRows: 0,
  classifierReady: 0,
  ownerCandidates: {},
  missingByReason: {},
  writes: 0,
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  canonicalAuthority: false,
};

const addReason = (reason, count = 1) => { report.missingByReason[reason] = (report.missingByReason[reason] ?? 0) + count; };

try {
  const columns = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('atlas_workspace_source_bindings', 'graphify_files', 'codebase_chunk_index', 'atlas_ast_nodes', 'atlas_packets', 'atlas_source_refs')
  `);
  const byTable = new Map();
  for (const row of columns.rows) byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.column_name]);
  report.ownerCandidates = Object.fromEntries([...byTable.entries()].map(([table, names]) => [table, {
    present: true,
    hasSourceRevision: names.includes('source_revision') || names.includes('code_source_revision'),
    hasContent: names.includes('content') || names.includes('content_text') || names.includes('chunk_text'),
    hasContentHash: names.includes('content_hash') || names.includes('content_digest'),
    hasEvidenceSpan: ['start_byte', 'end_byte'].every((name) => names.includes(name)) || ['byte_start', 'byte_end'].every((name) => names.includes(name)),
    hasSourceNamespace: names.includes('source_namespace'),
  }]));
  const chunkColumns = new Set(byTable.get('codebase_chunk_index') ?? []);
  const chunkSourceRevision = chunkColumns.has('source_revision')
    ? 'source_revision'
    : chunkColumns.has('code_source_revision')
      ? 'code_source_revision'
      : 'NULL::text';

  const graphify = await pool.query(`
    SELECT source_ref, source_revision, code_source_revision, workspace_revision, content_hash
    FROM public.graphify_files
    WHERE source_ref = ANY($1::text[]) OR source_ref = ANY($2::text[])
       OR lower(source_ref) = ANY($3::text[]) OR lower(source_ref) = ANY($4::text[])
  `, [rawRefs, rawPrefixedRefs, refs, prefixedRefs]);
  const graphifyByRef = new Map();
  for (const row of graphify.rows) {
    const key = normalize(row.source_ref);
    for (const candidateKey of [key, key.replace(/^sveltekit-frontend\//, '')]) {
      const list = graphifyByRef.get(candidateKey) ?? [];
      list.push(row);
      graphifyByRef.set(candidateKey, list);
    }
  }
  report.exactRevisionMatches = bindings.filter((binding) => {
    const matches = graphifyByRef.get(normalize(binding.relativePath)) ?? [];
    return matches.some((row) => String(row.code_source_revision ?? row.source_revision ?? '') === String(binding.sourceRevision));
  }).length;

  const chunks = await pool.query(`
    SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
           count(*)::integer AS chunk_count,
           count(*) FILTER (WHERE content IS NOT NULL AND btrim(content) <> '')::integer AS content_count,
           count(*) FILTER (WHERE content_hash IS NOT NULL)::integer AS hash_count,
           ${chunkSourceRevision} AS source_revision
    FROM public.codebase_chunk_index
    WHERE source_ref = ANY($1::text[]) OR source_ref = ANY($2::text[])
       OR lower(source_ref) = ANY($3::text[]) OR lower(source_ref) = ANY($4::text[])
    GROUP BY 1, ${chunkSourceRevision}
  `, [rawRefs, rawPrefixedRefs, refs, prefixedRefs]);
  const chunkByRef = new Map(chunks.rows.map((row) => [normalize(row.source_ref), row]));
  for (const row of chunks.rows) chunkByRef.set(normalize(row.source_ref).replace(/^sveltekit-frontend\//, ''), row);
  for (const binding of bindings) {
    const chunk = chunkByRef.get(normalize(binding.relativePath));
    if (!chunk) { addReason('CANONICAL_CHUNK_OWNER_MISSING'); continue; }
    if (Number(chunk.content_count) === 0) { addReason('CHUNK_CONTENT_MISSING'); continue; }
    if (Number(chunk.hash_count) === 0) { addReason('CHUNK_CONTENT_HASH_MISSING'); continue; }
    report.contentHydrated += 1;
    const chunkRevision = String(chunk.source_revision ?? '').trim();
    if (!chunkRevision) { addReason('CHUNK_OWNER_HAS_CONTENT_BUT_NO_SOURCE_REVISION'); continue; }
    if (chunkRevision !== String(binding.sourceRevision)) { addReason('CHUNK_OWNER_SOURCE_REVISION_MISMATCH'); }
  }
  const astRows = await pool.query(`
    SELECT lower(relative_path) AS source_ref, source_revision, source_content_hash,
           start_byte, end_byte
    FROM public.atlas_ast_nodes
    WHERE relative_path = ANY($1::text[]) OR relative_path = ANY($2::text[])
       OR lower(relative_path) = ANY($3::text[]) OR lower(relative_path) = ANY($4::text[])
  `, [rawRefs, rawPrefixedRefs, refs, prefixedRefs]);
  const astByRef = new Map();
  report.astCandidateRows = astRows.rows.length;
  report.astRevisionQualifiedRows = astRows.rows.filter((row) => row.source_revision && row.source_content_hash && row.start_byte != null && row.end_byte != null).length;
  for (const row of astRows.rows) {
    const key = normalize(row.source_ref);
    for (const candidateKey of [key, key.replace(/^sveltekit-frontend\//, '')]) {
      const list = astByRef.get(candidateKey) ?? [];
      list.push(row);
      astByRef.set(candidateKey, list);
    }
  }
  report.revisionBoundSpanOwner = bindings.filter((binding) => {
    const rows = astByRef.get(normalize(binding.relativePath)) ?? [];
    return rows.some((row) => String(row.source_revision ?? '') === String(binding.sourceRevision)
      && row.source_content_hash && row.start_byte != null && row.end_byte != null
      && Number(row.end_byte) > Number(row.start_byte));
  }).length;
  report.evidenceSpanReady = 0;
  report.authoritativeNamespaces = 0;
  report.classifierReady = 0;
  report.status = 'SOURCE_EVIDENCE_HYDRATION_BLOCKED';
  report.nextGate = 'RESOLVE_REVISION_BOUND_CONTENT_AND_SOURCE_NAMESPACE_AUTHORITY';
} catch (error) {
  report.status = 'SOURCE_EVIDENCE_AUDIT_ERROR';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  inputRows: report.inputRows,
  exactRevisionMatches: report.exactRevisionMatches,
  contentHydrated: report.contentHydrated,
  authoritativeNamespaces: report.authoritativeNamespaces,
  evidenceSpanReady: report.evidenceSpanReady,
  classifierReady: report.classifierReady,
  missingByReason: report.missingByReason,
  writes: report.writes,
  reportPath: 'docs/reports/current-source-evidence-hydration-v1.json',
}, null, 2));
