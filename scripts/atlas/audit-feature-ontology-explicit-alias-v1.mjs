#!/usr/bin/env node
/**
 * REL-01A3: read-only explicit source-alias review for legacy USES_CONCEPT tuples.
 *
 * This does not:
 * - mutate atlas_source_aliases
 * - rewrite feature_ontology_tuples
 * - insert Graphify rows
 * - materialize relationships
 * - derive a graph revision
 *
 * The only candidate transformation is the versioned, explicit:
 *   src/... -> sveltekit-frontend/src/...
 * and it is never auto-promoted.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  ALIAS_RESOLVER_REVISION,
  aliasSelectionChecksum,
  classifyExplicitAliasCandidate,
  cleanText,
  proposeFrontendRootPrefixAlias,
} from './lib/feature-ontology-explicit-alias-v1.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const reportPath = path.resolve(REPO_ROOT, 'docs/reports/feature-ontology-explicit-alias-v1.json');
const observationPath = path.resolve(REPO_ROOT, 'docs/reports/workspace-source-binding-observation.json');

function loadObservation() {
  const raw = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
  const workspaceRevision = cleanText(raw.record?.workspaceRevision);
  if (!workspaceRevision?.startsWith('sha256:')) {
    throw new Error(`EXPLICIT_ALIAS_CURRENT_SHA256_WORKSPACE_REQUIRED:${workspaceRevision ?? 'missing'}`);
  }
  const bindings = new Map(
    (Array.isArray(raw.bindings) ? raw.bindings : [])
      .map((item) => [cleanText(item?.sourceRef), item])
      .filter(([sourceRef]) => Boolean(sourceRef)),
  );
  return { workspaceRevision, bindings };
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
});

try {
  const observation = loadObservation();

  const tupleResult = await pool.query(`
    SELECT source_ref,
           count(*)::integer AS tuple_count,
           count(DISTINCT packet_key)::integer AS packet_count,
           min(extractor_version)::text AS min_extractor_version,
           max(extractor_version)::text AS max_extractor_version
      FROM public.feature_ontology_tuples
     WHERE predicate = 'USES_CONCEPT'
       AND NULLIF(btrim(source_ref), '') IS NOT NULL
     GROUP BY source_ref
     ORDER BY source_ref
  `);

  const graphifyResult = await pool.query(`
    SELECT source_ref, count(*)::integer AS row_count
      FROM public.graphify_files
     WHERE NULLIF(btrim(source_ref), '') IS NOT NULL
     GROUP BY source_ref
  `);
  const graphifyCount = new Map(graphifyResult.rows.map((row) => [cleanText(row.source_ref), Number(row.row_count)]));

  const candidates = [];
  for (const row of tupleResult.rows) {
    const sourceRef = cleanText(row.source_ref);
    const proposal = proposeFrontendRootPrefixAlias(sourceRef);

    if (proposal.resolutionKind !== 'ROOT_PREFIX_ALIAS') {
      candidates.push({
        aliasSourceRef: sourceRef,
        canonicalSourceRef: null,
        tupleCount: Number(row.tuple_count),
        packetCount: Number(row.packet_count),
        extractorVersions: [row.min_extractor_version, row.max_extractor_version].filter(Boolean),
        classification: 'NOT_FRONTEND_PREFIX_CANDIDATE',
        promotable: false,
        resolutionKind: proposal.resolutionKind,
        reason: proposal.reason,
        graphifyAliasRows: graphifyCount.get(sourceRef) ?? 0,
        graphifyCanonicalRows: 0,
        observationAliasPresent: observation.bindings.has(sourceRef),
        observationCanonicalPresent: false,
      });
      continue;
    }

    const canonicalSourceRef = proposal.canonicalSourceRef;
    const rawRepoRefObserved = observation.bindings.has(sourceRef);
    const classified = classifyExplicitAliasCandidate({
      aliasSourceRef: sourceRef,
      canonicalSourceRef,
      observationBindings: observation.bindings,
      rawRepoRefObserved,
      graphifyAliasCount: graphifyCount.get(sourceRef) ?? 0,
      graphifyCanonicalCount: graphifyCount.get(canonicalSourceRef) ?? 0,
    });

    candidates.push({
      aliasSourceRef: sourceRef,
      canonicalSourceRef,
      tupleCount: Number(row.tuple_count),
      packetCount: Number(row.packet_count),
      extractorVersions: [row.min_extractor_version, row.max_extractor_version].filter(Boolean),
      resolutionKind: 'ROOT_PREFIX_ALIAS',
      classification: classified.classification,
      promotable: false,
      reason: classified.reason,
      observationAliasPresent: rawRepoRefObserved,
      observationCanonicalPresent: observation.bindings.has(canonicalSourceRef),
      graphifyAliasRows: graphifyCount.get(sourceRef) ?? 0,
      graphifyCanonicalRows: graphifyCount.get(canonicalSourceRef) ?? 0,
      evidenceRefs: [
        'docs/reports/workspace-source-binding-observation.json',
        'feature_ontology_tuples:USES_CONCEPT',
      ],
      resolverRevision: ALIAS_RESOLVER_REVISION,
    });
  }

  const reviewReady = candidates.filter((row) => row.classification === 'EXPLICIT_ALIAS_REVIEW_READY');
  const collisions = candidates.filter((row) =>
    row.classification === 'DUAL_NAMESPACE_COLLISION' ||
    row.classification === 'DUAL_GRAPHIFY_IDENTITY_COLLISION'
  );
  const unresolved = candidates.filter((row) =>
    !['EXPLICIT_ALIAS_REVIEW_READY', 'DUAL_NAMESPACE_COLLISION', 'DUAL_GRAPHIFY_IDENTITY_COLLISION'].includes(row.classification)
  );

  const counts = {
    distinctUsesConceptSourceRefs: candidates.length,
    tuplesCovered: candidates.reduce((sum, row) => sum + row.tupleCount, 0),
    explicitAliasReviewReadySourceRefs: reviewReady.length,
    explicitAliasReviewReadyTuples: reviewReady.reduce((sum, row) => sum + row.tupleCount, 0),
    collisions: collisions.length,
    unresolved: unresolved.length,
    promotableAliases: 0,
  };

  const report = {
    schema: 'atlas.feature-ontology-explicit-alias.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    gpuWrites: false,
    workspaceRevision: observation.workspaceRevision,
    resolverRevision: ALIAS_RESOLVER_REVISION,
    aliasPolicy: {
      transformation: 'src/... -> sveltekit-frontend/src/...',
      resolutionKind: 'ROOT_PREFIX_ALIAS',
      automaticPromotion: false,
      durableOwnerDesign: 'atlas_source_aliases',
      requiredDurableStatusForPromotion: 'VERIFIED',
      rewriteHistoricalTupleSourceRefs: false,
      fuzzyMatching: false,
      basenameMatching: false,
    },
    counts,
    selectionChecksum: aliasSelectionChecksum(candidates),
    candidates,
    status:
      reviewReady.length > 0 && collisions.length === 0
        ? 'EXPLICIT_ALIAS_COHORT_READY_FOR_HUMAN_APPROVAL'
        : collisions.length > 0
          ? 'EXPLICIT_ALIAS_COHORT_BLOCKED_BY_COLLISION'
          : 'EXPLICIT_ALIAS_COHORT_NOT_READY',
    nextGate:
      reviewReady.length > 0 && collisions.length === 0
        ? 'APPROVE_VERSIONED_ROOT_PREFIX_ALIAS_WITHOUT_APPLYING_MIGRATION'
        : 'RESOLVE_SOURCE_SCOPE_BEFORE_ALIAS_APPROVAL',
    relationshipGraphRevision: null,
    rel01bAllowed: false,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    status: report.status,
    workspaceRevision: report.workspaceRevision,
    counts: report.counts,
    selectionChecksum: report.selectionChecksum,
    rel01bAllowed: false,
    report: path.relative(REPO_ROOT, reportPath),
  }, null, 2));
} finally {
  await pool.end();
}
