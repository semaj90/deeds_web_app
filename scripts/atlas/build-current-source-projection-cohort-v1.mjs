#!/usr/bin/env node

/** Build a read-only cohort from namespace and byte-integrity evidence. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const comparisonPath = path.join(root, 'docs/reports/source-manifest-projection-comparison-v1.json');
const scopePath = path.join(root, 'docs/reports/source-scope-reconciliation-v1.json');
const reportPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const comparison = JSON.parse(fs.readFileSync(comparisonPath, 'utf8'));
const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));

const normalizeRef = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const normalizeHash = (value) => String(value ?? '').trim().toLowerCase().replace(/^sha256:/, '');
const sourceRefs = [...new Set((comparison.records ?? []).map((row) => normalizeRef(row.relativePath)).filter(Boolean))];
const prefixedRefs = sourceRefs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
  application_name: 'atlas-current-source-cohort-builder-read-only',
});

let graphifyRows = [];
let databaseError = null;
try {
  const columnResult = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'graphify_files'
  `);
  const columns = new Set(columnResult.rows.map((row) => row.column_name));
  const optional = (name) => columns.has(name) ? `gf.${name}` : 'NULL::text';
  const result = await pool.query(`
    SELECT gf.source_ref,
           gf.content_hash,
           gf.workspace_revision,
           gf.code_source_revision,
           gf.source_revision,
           ${optional('parser_contract_version')} AS parser_contract_version,
           ${optional('extraction_contract_version')} AS extraction_contract_version
    FROM public.graphify_files gf
    WHERE lower(regexp_replace(regexp_replace(btrim(gf.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = ANY($1::text[])
       OR lower(regexp_replace(regexp_replace(btrim(gf.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = ANY($2::text[])
    ORDER BY gf.source_ref
  `, [sourceRefs, prefixedRefs]);
  graphifyRows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const graphifyByRef = new Map();
for (const row of graphifyRows) {
  const key = normalizeRef(row.source_ref);
  for (const candidate of [key, key.replace(/^sveltekit-frontend\//, '')]) {
    const list = graphifyByRef.get(candidate) ?? [];
    list.push(row);
    graphifyByRef.set(candidate, list);
  }
}

const rows = (comparison.records ?? []).map((row) => {
  const namespace = row.namespace?.classification ?? 'UNCLASSIFIED';
  const byteExact = row.classification === 'EXACT_FILE_BYTES';
  const ref = normalizeRef(row.relativePath);
  const matches = [...(graphifyByRef.get(ref) ?? []), ...(graphifyByRef.get(`sveltekit-frontend/${ref}`) ?? [])];
  const uniqueMatches = [...new Map(matches.map((match) => [JSON.stringify(match), match])).values()];
  const exactSourceMatches = uniqueMatches.filter((match) =>
    normalizeHash(match.content_hash) === normalizeHash(row.filesystemHash)
    && Boolean(String(match.code_source_revision ?? match.source_revision ?? '').trim()),
  );
  const eligible = namespace === 'EXACT_CURRENT' && byteExact && exactSourceMatches.length === 1;
  const classification = databaseError
    ? 'REVISION_OWNER_UNAVAILABLE'
    : exactSourceMatches.length === 1
      ? (eligible ? 'EXACT_CURRENT_SOURCE' : 'SOURCE_NAMESPACE_OR_BYTE_MISMATCH')
      : exactSourceMatches.length > 1
        ? 'AMBIGUOUS'
        : uniqueMatches.length === 0
          ? 'MISSING'
          : uniqueMatches.some((match) => normalizeHash(match.content_hash) !== normalizeHash(row.filesystemHash))
            ? 'CHANGED'
            : 'REVISION_UNPROVEN';
  const exact = exactSourceMatches[0] ?? null;
  return {
    relativePath: row.relativePath,
    sourceRootAuthority: row.sourceRootAuthority,
    namespaceClassification: namespace,
    hashClassification: row.classification,
    filesystemHash: row.filesystemHash ?? null,
    graphifyRowCount: uniqueMatches.length,
    sourceRevision: exact?.code_source_revision ?? exact?.source_revision ?? null,
    workspaceRevision: exact?.workspace_revision ?? null,
    parserContractVersion: exact?.parser_contract_version ?? null,
    extractionContractVersion: exact?.extraction_contract_version ?? null,
    sourceBindingClassification: classification,
    eligibleCurrentSource: eligible,
    admissionReason: eligible ? 'EXACT_NAMESPACE_BYTES_AND_REVISION_BINDING' : 'DIAGNOSTIC_ONLY',
  };
});

const counts = rows.reduce((result, row) => {
  result.total += 1;
  result[`${row.namespaceClassification}_NAMESPACE`] = (result[`${row.namespaceClassification}_NAMESPACE`] ?? 0) + 1;
  result[`${row.hashClassification}_HASH`] = (result[`${row.hashClassification}_HASH`] ?? 0) + 1;
  if (row.eligibleCurrentSource) result.eligibleCurrentSources += 1;
  return result;
}, { total: 0, eligibleCurrentSources: 0 });

const report = {
  schema: 'atlas.current-source-projection-cohort.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_COHORT_PLANNING',
  inputs: {
    comparison: { path: path.relative(root, comparisonPath).replaceAll('\\', '/'), reportStatus: comparison.status ?? null },
    scope: { path: path.relative(root, scopePath).replaceAll('\\', '/'), manifestChecksum: scope.denominator?.manifestChecksum ?? null },
  },
  database: {
    table: 'public.graphify_files',
    readOnly: true,
    error: databaseError,
  },
  counts,
  cohort: rows.filter((row) => row.eligibleCurrentSource),
  diagnosticCounts: {
    namespaceExactButHashNotExact: rows.filter((row) => row.namespaceClassification === 'EXACT_CURRENT' && !row.eligibleCurrentSource).length,
    unresolvedNamespace: rows.filter((row) => row.namespaceClassification === 'UNRESOLVED').length,
    excluded: rows.filter((row) => row.namespaceClassification === 'EXCLUDED').length,
  },
  canonicalAuthority: false,
  postgresWrites: false,
  qdrantWrites: false,
  graphifyWrites: false,
  relationshipWrites: false,
  status: databaseError
    ? 'CURRENT_SOURCE_COHORT_OWNER_UNAVAILABLE'
    : counts.eligibleCurrentSources > 0
      ? 'CURRENT_SOURCE_COHORT_READY_FOR_PROJECTION_REVIEW'
      : 'CURRENT_SOURCE_COHORT_EMPTY',
  nextGate: databaseError ? 'GRAPHIFY_REVISION_OWNER_READABILITY_REQUIRED' : 'SOURCE_PROJECTION_REVISION_REVIEW_REQUIRED',
};
report.cohortChecksum = crypto.createHash('sha256').update(JSON.stringify(report.cohort)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, counts, cohortChecksum: report.cohortChecksum, reportPath: 'docs/reports/current-source-projection-cohort-v1.json' }, null, 2));
