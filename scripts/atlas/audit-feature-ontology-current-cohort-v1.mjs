#!/usr/bin/env node
/**
 * Read-only REL-01A census for current-workspace feature ontology tuples.
 *
 * This intentionally joins only on exact source_ref equality. It does not
 * normalize paths, use aliases, compare hash domains, or infer graph lineage.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { CURRENT_COHORT_PREDICATE } from './lib/feature-ontology-current-cohort-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-current-cohort-v1.json');
const OBSERVATION = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 0);
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const loadWorkspaceRevision = () => {
  try {
    const report = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
    return clean(report.record?.workspaceRevision);
  } catch {
    return null;
  }
};

const validWorkspaceRevision = (value) => /^sha256:[0-9a-f]{64}$/i.test(clean(value) ?? '');

const loadObservedRefs = () => {
  try {
    const observation = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json'), 'utf8'));
    return new Set((observation.bindings ?? []).map((row) => clean(row.sourceRef)).filter(Boolean));
  } catch {
    return new Set();
  }
};

async function main() {
  const expectedWorkspaceRevision = loadWorkspaceRevision();
  if (!validWorkspaceRevision(expectedWorkspaceRevision)) {
    throw new Error(`CURRENT_WORKSPACE_REVISION_REQUIRED: ${expectedWorkspaceRevision ?? 'missing'}`);
  }

  const schema = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('feature_ontology_tuples', 'graphify_files')
  `);
  const has = (table, column) => schema.rows.some((row) => row.table_name === table && row.column_name === column);
  const required = [
    ['feature_ontology_tuples', 'id'],
    ['feature_ontology_tuples', 'packet_key'],
    ['feature_ontology_tuples', 'source_ref'],
    ['feature_ontology_tuples', 'predicate'],
    ['feature_ontology_tuples', 'ontology_version'],
    ['feature_ontology_tuples', 'extractor_version'],
    ['graphify_files', 'file_id'],
    ['graphify_files', 'source_ref'],
    ['graphify_files', 'workspace_revision'],
    ['graphify_files', 'source_revision'],
    ['graphify_files', 'code_source_revision'],
    ['graphify_files', 'content_hash'],
  ];
  const missingColumns = required.filter(([table, column]) => !has(table, column)).map(([table, column]) => `${table}.${column}`);
  if (missingColumns.length) {
    throw new Error(`REL_01A_SCHEMA_UNAVAILABLE: ${missingColumns.join(', ')}`);
  }

  const limitSql = LIMIT > 0 ? `LIMIT ${Math.floor(LIMIT)}` : '';
  const result = await pool.query(`
    WITH graphify_by_source AS (
      SELECT
        source_ref,
        count(*)::integer AS graphify_row_count,
        count(*) FILTER (WHERE workspace_revision IS NOT NULL)::integer AS workspace_revision_count,
        count(*) FILTER (WHERE workspace_revision = $1)::integer AS current_workspace_row_count,
        array_agg(file_id::text ORDER BY file_id::text) AS graphify_file_ids,
        max(workspace_revision::text) AS workspace_revision,
        max(code_source_revision) AS code_source_revision,
        max(source_revision) AS source_revision,
        max(content_hash) AS content_hash
      FROM public.graphify_files
      WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
      GROUP BY source_ref
    ), tuples AS (
      SELECT
        id::text AS tuple_id,
        packet_key,
        source_ref,
        predicate,
        ontology_version,
        extractor_version
      FROM public.feature_ontology_tuples
      WHERE predicate = '${CURRENT_COHORT_PREDICATE}'
        AND NULLIF(btrim(source_ref), '') IS NOT NULL
      ORDER BY source_ref, id::text
      ${limitSql}
    )
    SELECT
      t.tuple_id,
      t.packet_key,
      t.source_ref AS tuple_source_ref,
      g.source_ref AS graphify_source_ref,
      CASE WHEN g.graphify_row_count = 1 THEN g.graphify_file_ids[1] ELSE NULL END AS graphify_file_id,
      g.graphify_row_count,
      g.workspace_revision,
      g.code_source_revision,
      g.source_revision,
      g.content_hash,
      t.ontology_version,
      t.extractor_version,
      t.predicate,
      CASE
        WHEN g.source_ref IS NULL THEN 'NO_EXACT_GRAPHIFY_SOURCE'
        WHEN g.graphify_row_count > 1 THEN 'EXACT_MULTIPLE_GRAPHIFY_ROWS'
        WHEN g.workspace_revision IS NULL OR btrim(g.workspace_revision) = '' THEN 'MISSING_WORKSPACE_REVISION'
        WHEN g.workspace_revision !~* '^sha256:[0-9a-f]{64}$' THEN 'INVALID_WORKSPACE_REVISION'
        WHEN g.workspace_revision <> $1 THEN 'EXACT_WRONG_WORKSPACE'
        ELSE 'CURRENT_EXACT_UNIQUE'
      END AS binding_classification
    FROM tuples t
    LEFT JOIN graphify_by_source g ON g.source_ref = t.source_ref
    ORDER BY t.source_ref, t.tuple_id
  `, [expectedWorkspaceRevision]);

  const rows = result.rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? value.map(clean) : clean(value)])
  ));
  const countBy = (classification) => rows.filter((row) => row.binding_classification === classification).length;
  const currentRows = rows.filter((row) => row.binding_classification === 'CURRENT_EXACT_UNIQUE');
  const observedRefs = loadObservedRefs();
  const aliasReview = rows.map((row) => {
    const sourceRef = row.tuple_source_ref;
    const aliasSourceRef = sourceRef?.startsWith('src/') ? `sveltekit-frontend/${sourceRef}` : null;
    return {
      tupleId: row.tuple_id,
      sourceRef,
      aliasSourceRef,
      aliasObservedInWorkspace: Boolean(aliasSourceRef && observedRefs.has(aliasSourceRef)),
      status: aliasSourceRef && observedRefs.has(aliasSourceRef) ? 'EXPLICIT_ALIAS_REVIEW_ONLY' : 'NO_ALIAS_OBSERVATION',
    };
  });
  const eligibleUsesConceptTuples = currentRows.filter((row) => String(row.predicate ?? '').toUpperCase() === 'USES_CONCEPT').length;
  const currentPredicateCounts = Object.fromEntries(
    [...new Set(currentRows.map((row) => row.predicate).filter(Boolean))]
      .sort()
      .map((predicate) => [predicate, currentRows.filter((row) => row.predicate === predicate).length])
  );
  const distinct = (key, input = rows) => new Set(input.map((row) => row[key]).filter(Boolean)).size;
  const counts = {
    examinedTuples: rows.length,
    exactSourceRefs: distinct('tuple_source_ref'),
    currentWorkspaceSourceRefs: distinct('graphify_source_ref', currentRows),
    currentWorkspaceTuples: currentRows.length,
    uniqueCurrentBindings: distinct('graphify_file_id', currentRows),
    ambiguousExactBindings: distinct('tuple_source_ref', rows.filter((row) => row.binding_classification === 'EXACT_MULTIPLE_GRAPHIFY_ROWS')),
    eligibleUsesConceptTuples,
    currentPredicateCounts,
    currentExactUnique: countBy('CURRENT_EXACT_UNIQUE'),
    exactWrongWorkspace: countBy('EXACT_WRONG_WORKSPACE'),
    exactMultipleGraphifyRows: countBy('EXACT_MULTIPLE_GRAPHIFY_ROWS'),
    missingWorkspaceRevision: countBy('MISSING_WORKSPACE_REVISION'),
    invalidWorkspaceRevision: countBy('INVALID_WORKSPACE_REVISION'),
    noExactGraphifySource: countBy('NO_EXACT_GRAPHIFY_SOURCE'),
  };
  const report = {
    schema: 'atlas.feature-ontology-current-cohort.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipGraphRevision: null,
    expectedWorkspaceRevision,
    predicate: CURRENT_COHORT_PREDICATE,
    selection: { limit: LIMIT || null, exactSourceRefEquality: true, aliases: false, normalization: false, hashDomainMixing: false },
    aliasReview: {
      policy: 'sveltekit-frontend/ prefix candidate is diagnostic only and is not an eligible binding',
      observedAliasTuples: aliasReview.filter((row) => row.status === 'EXPLICIT_ALIAS_REVIEW_ONLY').length,
      observedAliasSourceRefs: new Set(aliasReview.filter((row) => row.aliasObservedInWorkspace).map((row) => row.aliasSourceRef)).size,
      candidates: aliasReview,
    },
    tables: { ontology: 'public.feature_ontology_tuples', graphify: 'public.graphify_files' },
    counts,
    status: eligibleUsesConceptTuples > 0 ? 'CURRENT_RELATIONSHIP_COHORT_FOUND' : 'CURRENT_RELATIONSHIP_COHORT_EMPTY',
    nextGate: eligibleUsesConceptTuples > 0 ? 'REL_01B_CURRENT_RELATIONSHIP_PREVIEW_DRY_RUN' : 'SOURCE_BINDING_RECONCILIATION_REQUIRED',
    rows,
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, expectedWorkspaceRevision, counts, reportPath: REPORT }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
} finally {
  await pool.end();
}
