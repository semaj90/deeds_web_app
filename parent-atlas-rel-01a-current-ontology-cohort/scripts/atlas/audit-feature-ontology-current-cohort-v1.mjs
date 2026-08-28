#!/usr/bin/env node
/**
 * REL-01A: read-only census of feature_ontology_tuples that have an exact,
 * unique current-workspace Graphify source observation.
 *
 * Hard rules:
 * - literal source_ref equality only
 * - current workspace revision must be an explicit sha256: source-manifest revision
 * - no atlas_packets workspace fallback
 * - no basename / normalized / suffix / fuzzy path matching
 * - no graph revision is assigned here
 * - no database writes
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  REPO_ROOT,
  loadRepoEnv,
  resolveDatabaseUrl,
} from './connection-config.mjs';
import {
  CURRENT_COHORT_PREDICATE,
  classifyFeatureOntologyCurrentBinding,
  requireCurrentWorkspaceRevision,
  summarizeFeatureOntologyCurrentCohort,
} from './lib/feature-ontology-current-cohort-v1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = resolve(
  REPO_ROOT,
  process.env.ATLAS_FEATURE_ONTOLOGY_CURRENT_COHORT_OUT
    ?? 'docs/reports/feature-ontology-current-cohort-v1.json',
);
const OBSERVATION = resolve(
  REPO_ROOT,
  process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT
    ?? 'docs/reports/workspace-source-binding-observation.json',
);
const env = loadRepoEnv(process.env);
const sampleLimit = Math.max(
  1,
  Math.min(100, Number(process.env.ATLAS_FEATURE_ONTOLOGY_CURRENT_COHORT_SAMPLE_LIMIT ?? 25)),
);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function loadCurrentWorkspaceRevision() {
  if (clean(process.env.ATLAS_WORKSPACE_REVISION)) {
    return requireCurrentWorkspaceRevision(process.env.ATLAS_WORKSPACE_REVISION);
  }
  let observation;
  try {
    observation = JSON.parse(readFileSync(OBSERVATION, 'utf8'));
  } catch (error) {
    throw new Error(
      `FEATURE_ONTOLOGY_CURRENT_COHORT_WORKSPACE_OBSERVATION_REQUIRED:${OBSERVATION}:${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return requireCurrentWorkspaceRevision(observation?.record?.workspaceRevision);
}

async function assertRequiredColumns(pool) {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('feature_ontology_tuples', 'graphify_files')
  `);
  const available = new Set(
    result.rows.map((row) => `${row.table_name}.${row.column_name}`),
  );

  const required = [
    'feature_ontology_tuples.id',
    'feature_ontology_tuples.packet_key',
    'feature_ontology_tuples.source_ref',
    'feature_ontology_tuples.feature_key',
    'feature_ontology_tuples.subject_type',
    'feature_ontology_tuples.subject_id',
    'feature_ontology_tuples.predicate',
    'feature_ontology_tuples.object_type',
    'feature_ontology_tuples.object_id',
    'feature_ontology_tuples.ontology_version',
    'feature_ontology_tuples.extractor_version',
    'graphify_files.file_id',
    'graphify_files.workspace_id',
    'graphify_files.source_ref',
    'graphify_files.workspace_revision',
    'graphify_files.code_source_revision',
    'graphify_files.content_hash',
    'graphify_files.byte_length',
  ];

  const missing = required.filter((column) => !available.has(column));
  if (missing.length) {
    throw new Error(
      `FEATURE_ONTOLOGY_CURRENT_COHORT_REQUIRED_COLUMNS_MISSING:${missing.join(',')}`,
    );
  }

  return {
    hasGraphifySourceRevision: available.has('graphify_files.source_revision'),
  };
}

async function main() {
  const currentWorkspaceRevision = loadCurrentWorkspaceRevision();
  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 2,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 30_000,
  });

  try {
    const capabilities = await assertRequiredColumns(pool);
    const graphifySourceRevisionSql = capabilities.hasGraphifySourceRevision
      ? 'source_revision'
      : 'NULL::text AS source_revision';

    const tuples = await pool.query(
      `
        SELECT id, packet_key, source_ref, feature_key,
               subject_type, subject_id, predicate, object_type, object_id,
               ontology_version, extractor_version
        FROM public.feature_ontology_tuples
        WHERE predicate = $1
          AND NULLIF(btrim(source_ref), '') IS NOT NULL
        ORDER BY id
      `,
      [CURRENT_COHORT_PREDICATE],
    );

    const graphify = await pool.query(
      `
        WITH tuple_refs AS (
          SELECT DISTINCT source_ref
          FROM public.feature_ontology_tuples
          WHERE predicate = $1
            AND NULLIF(btrim(source_ref), '') IS NOT NULL
        )
        SELECT g.file_id, g.workspace_id, g.source_ref, g.workspace_revision,
               g.code_source_revision, ${graphifySourceRevisionSql},
               g.content_hash, g.byte_length
        FROM public.graphify_files g
        JOIN tuple_refs t ON t.source_ref = g.source_ref
        ORDER BY g.source_ref, g.workspace_revision NULLS FIRST, g.file_id
      `,
      [CURRENT_COHORT_PREDICATE],
    );

    const graphifyBySourceRef = new Map();
    for (const row of graphify.rows) {
      const sourceRef = String(row.source_ref);
      if (!graphifyBySourceRef.has(sourceRef)) graphifyBySourceRef.set(sourceRef, []);
      graphifyBySourceRef.get(sourceRef).push(row);
    }

    const classifiedRows = tuples.rows.map((tuple) => {
      const result = classifyFeatureOntologyCurrentBinding({
        tuple,
        graphifyMatches: graphifyBySourceRef.get(String(tuple.source_ref)) ?? [],
        currentWorkspaceRevision,
      });
      return {
        tupleId: String(tuple.id),
        sourceRef: String(tuple.source_ref),
        classification: result.classification,
        eligible: result.eligible,
        binding: result.binding ?? null,
        currentMatchCount: result.currentMatches?.length ?? 0,
      };
    });

    const summary = summarizeFeatureOntologyCurrentCohort(classifiedRows);
    const exactSourceRefs = new Set(
      tuples.rows
        .map((row) => String(row.source_ref))
        .filter((sourceRef) => graphifyBySourceRef.has(sourceRef)),
    );
    const currentWorkspaceSourceRefs = new Set(
      classifiedRows
        .filter((row) => row.currentMatchCount > 0)
        .map((row) => row.sourceRef),
    );
    const eligibleBindings = classifiedRows
      .filter((row) => row.eligible && row.binding)
      .map((row) => row.binding);

    const samplesByClassification = {};
    for (const row of classifiedRows) {
      if (!samplesByClassification[row.classification]) {
        samplesByClassification[row.classification] = [];
      }
      if (samplesByClassification[row.classification].length < sampleLimit) {
        samplesByClassification[row.classification].push({
          tupleId: row.tupleId,
          sourceRef: row.sourceRef,
          currentMatchCount: row.currentMatchCount,
        });
      }
    }

    const report = {
      schema: 'atlas.feature-ontology-current-cohort.v1',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      readOnly: true,
      postgresWrites: false,
      qdrantWrites: false,
      neo4jWrites: false,
      valkeyWrites: false,
      predicate: CURRENT_COHORT_PREDICATE,
      currentWorkspaceRevision,
      authority: {
        workspaceRevision: 'workspace-source-binding-observation.record.workspaceRevision or explicit ATLAS_WORKSPACE_REVISION',
        sourceObservation: 'public.graphify_files',
        sourceRevision: 'public.graphify_files.code_source_revision',
        sourceRefJoin: 'literal feature_ontology_tuples.source_ref = graphify_files.source_ref',
      },
      matchingPolicy: {
        rawExact: true,
        normalized: false,
        basename: false,
        suffix: false,
        fuzzy: false,
        crossDomainHashEquality: false,
        atlasPacketWorkspaceFallback: false,
        historicalGitRevisionFallback: false,
        callerSuppliedGraphRevision: false,
      },
      counts: {
        ontologyTuplesInspected: summary.tuplesInspected,
        exactSourceRefs: exactSourceRefs.size,
        currentWorkspaceSourceRefs: currentWorkspaceSourceRefs.size,
        currentWorkspaceTuples: classifiedRows.filter((row) => row.currentMatchCount > 0).length,
        uniqueCurrentBindings: summary.eligibleUsesConceptTuples,
        eligibleUsesConceptTuples: summary.eligibleUsesConceptTuples,
        eligibleExactSourceRefs: summary.eligibleExactSourceRefs,
        ...summary.byClassification,
      },
      status: summary.status,
      samplesByClassification,
      eligibleBindingSample: eligibleBindings.slice(0, sampleLimit),
      relationshipGraphRevision: null,
      nextGate: summary.eligibleUsesConceptTuples > 0
        ? 'REL_01B_PREVIEW_CURRENT_EXACT_RELATIONSHIP_KERNELS'
        : 'SOURCE_BINDING_RECONCILIATION_REQUIRED',
    };

    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
      schema: report.schema,
      status: report.status,
      readOnly: true,
      currentWorkspaceRevision,
      counts: report.counts,
      nextGate: report.nextGate,
      report: REPORT,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `[feature-ontology-current-cohort] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
