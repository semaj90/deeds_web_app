#!/usr/bin/env node
/**
 * PACKET REGISTRY WRITER OWNERSHIP 01 (read-only)
 *
 * Answers a stronger question than "these scripts exist": for every file in
 * this repo that issues INSERT/UPDATE against atlas_packets or
 * atlas_packet_registry, which ONE runtime boundary is actually permitted to
 * establish canonical packet identity, and what is every other writer's real
 * relationship to that boundary?
 *
 * A script being *capable* of an UPSERT does not make it the owner. This
 * script classifies every candidate writer by (a) whether it lives in the
 * live application runtime (sveltekit-frontend/src, packages/*\/src) vs a
 * standalone script (scripts/, sveltekit-frontend/scripts/), (b) whether it
 * is reachable from a real caller (an import in live runtime code, an npm
 * script, or a cron/startup/graphify chain reference), (c) whether it
 * mutates identity-bearing columns (packet_key/source_ref/feature_id) vs only
 * derived/projection columns (qdrant_point_id, som_cluster, community_id...),
 * and (d) whether it is dry-run-gated before it can mutate.
 *
 * CANDIDATES below is a frozen, reproducible list captured 2026-09-08 via:
 *   rg -l -E '(INSERT\s+INTO\s+"?atlas_packets"?[^_]|UPDATE\s+"?atlas_packets"?[^_]|
 *              INSERT\s+INTO\s+"?atlas_packet_registry"?|UPDATE\s+"?atlas_packet_registry"?)'
 *      --include='*.mjs' --include='*.mts' --include='*.ts'
 *      scripts/ sveltekit-frontend/src/ sveltekit-frontend/scripts/ packages/
 * (107 files). Re-run that command and diff against CANDIDATES before trusting
 * this receipt on a later date -- new writers can appear without this file
 * being updated.
 *
 * Writes ONE receipt. Never executes a writer, never mutates schema or data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'packet-registry-writer-ownership-v1.json');

const CANDIDATES = [
  'packages/atlas-core/src/validation/gan-deep-audit.ts',
  'scripts/atlas/atlas-packets-content-hash-backfill-v1.mjs',
  'scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs',
  'scripts/atlas/backfill-atlas-source-refs.mjs',
  'scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs',
  'scripts/atlas/backfill-feature-label-payload.mjs',
  'scripts/atlas/backfill-graphify-feature-id.mjs',
  'scripts/atlas/backfill-identity-spine.mjs',
  'scripts/atlas/backfill-packet-registry.mjs',
  'scripts/atlas/backfill-packets-to-qdrant.mjs',
  'scripts/atlas/backfill-packets-to-qdrant-ollama.mjs',
  'scripts/atlas/backfill-qdrant-point-id-from-chunks.mjs',
  'scripts/atlas/backfill-qdrant-point-ids.mjs',
  'scripts/atlas/backfill-reward-prior.mjs',
  'scripts/atlas/backfill-som-cluster-direct.mjs',
  'scripts/atlas/backfill-som-community-id.mjs',
  'scripts/atlas/backfill-source-ref-keys.mjs',
  'scripts/atlas/backfill-title-identity.mjs',
  'scripts/atlas/backfill-topology-authority.mjs',
  'scripts/atlas/build-implementation-intent-aliases.mjs',
  'scripts/atlas/classify-domain-ontology.mjs',
  'scripts/atlas/cluster-summaries-topk.mjs',
  'scripts/atlas/collect-runtime-evidence.mjs',
  'scripts/atlas/compute-louvain-neo4j.mjs',
  'scripts/atlas/compute-missing-packet-keys.mjs',
  'scripts/atlas/enrich_atlas_packets.mjs',
  'scripts/atlas/enrich-atlas-concept-ids.mjs',
  'scripts/atlas/enrich-domain-packet-payloads.mjs',
  'scripts/atlas/gpu-tensor-worker.mjs',
  'scripts/atlas/graphify-cluster-sync-partition.mjs',
  'scripts/atlas/graphify-langgraph-pipeline.mjs',
  'scripts/atlas/hyperrag-packet-materializer.mjs',
  'scripts/atlas/index-env-contract.mjs',
  'scripts/atlas/index-parent-atlas-packets.mjs',
  'scripts/atlas/ingest-msgpack-chunks.mjs',
  'scripts/atlas/ingest-qdrant-to-atlas-packets.mjs',
  'scripts/atlas/langextract-entity-bridge.mjs',
  'scripts/atlas/lexical-feature-extraction.mjs',
  'scripts/atlas/link-postgres-to-qdrant.mjs',
  'scripts/atlas/materialize-registry-topology.mjs',
  'scripts/atlas/p0-identify-recoverable-packets.mjs',
  'scripts/atlas/p0-qdrant-bridge-deterministic.mjs',
  'scripts/atlas/parent-atlas-health-check.mts',
  'scripts/atlas/parent-atlas-semantic-768-backfill.mjs',
  'scripts/atlas/phase-17-hyperrag-indexing-e2e.mjs',
  'scripts/atlas/phase1-canonical-embedding-backfill.mjs',
  'scripts/atlas/phase1-canonical-embedding-rabbitmq-producer.mjs',
  'scripts/atlas/phase-1c-backfill-som-cluster.mjs',
  'scripts/atlas/phase-2a-ast-grep-lexical-kmeans-topology.mjs',
  'scripts/atlas/phase8-deduplication-gate.mjs',
  'scripts/atlas/phase9-domain-classifier-full-coverage.mjs',
  'scripts/atlas/populate-selected-concepts.mjs',
  'scripts/atlas/promote-pagerank-authority-from-neo4j.mjs',
  'scripts/atlas/qdrant-bridge-complete.mjs',
  'scripts/atlas/qdrant-point-id-bridge.mjs',
  'scripts/atlas/register-orphaned-chunks.mjs',
  'scripts/atlas/run-som-on-chunks.mjs',
  'scripts/atlas/standardize-feature-envelope.mjs',
  'scripts/atlas/summary-ranking-retrieval-pipeline.mjs',
  'scripts/atlas/sync-community-from-neo4j.mjs',
  'scripts/atlas/sync-neo4j-packet-keys.mjs',
  'scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs',
  'scripts/atlas/sync-tree-node-title-ids.mjs',
  'scripts/atlas/task-2-materialize-envelope-fields.mjs',
  'scripts/atlas/title-identity-backfill-smoke.mjs',
  'scripts/atlas/upsert-whole-codebase-atlas-packets.mjs',
  'scripts/atlas/validate-source-ref-identity.mjs',
  'scripts/audit/rpc-tool-calling-db-audit.mjs',
  'scripts/backfill-title-identity.mjs',
  'scripts/graphify/stages/stage0-identity-backfill.mjs',
  'scripts/ontology/backfill-ontology-full.mjs',
  'scripts/ontology/backfill-ontology-test.mjs',
  'scripts/ontology/extract-tuples-worker.mjs',
  'scripts/phase-2-summary-upsert.mjs',
  'scripts/phase-3-kmeans-cluster.mjs',
  'scripts/phase-d-ingest-2more.mjs',
  'scripts/phase-d-ingest-final-missing.mjs',
  'scripts/phase-d-ingest-missing-packets.mjs',
  'scripts/phase-d-plus-1/user-outcome-collection.mjs',
  'scripts/phase-d-plus-2/daily-authority-adjustment.mjs',
  'sveltekit-frontend/scripts/atlas/backfill-packets-embeddings-pool.mjs',
  'sveltekit-frontend/scripts/atlas/backfill-qdrant-point-id-bridge.mjs',
  'sveltekit-frontend/scripts/atlas/backfill-qdrant-point-ids-v2.mts',
  'sveltekit-frontend/scripts/atlas/classify-domains-simple.mts',
  'sveltekit-frontend/scripts/atlas/classify-domains-sql-only.mts',
  'sveltekit-frontend/scripts/atlas/gemma4-batch-summarize-packets.mjs',
  'sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts',
  'sveltekit-frontend/scripts/atlas/kmeans-summary-enrichment.mts',
  'sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts',
  'sveltekit-frontend/scripts/atlas/packet-chunk-lineage-canary-01.mts',
  'sveltekit-frontend/scripts/atlas/phase1-domain-class-backfill.mjs',
  'sveltekit-frontend/scripts/atlas/phase2-concepts-simple-backfill.mjs',
  'sveltekit-frontend/scripts/atlas/phase8e-tree-node-backfill.mjs',
  'sveltekit-frontend/scripts/atlas/phase8-feature-envelope-materialization.mjs',
  'sveltekit-frontend/scripts/atlas/phase9-bitfrost-semantic-cache.mjs',
  'sveltekit-frontend/scripts/atlas/populate-atlas-packets-aggressive.mjs',
  'sveltekit-frontend/scripts/atlas/promotion-worker.mjs',
  'sveltekit-frontend/scripts/atlas/recon-canary-01.mts',
  'sveltekit-frontend/scripts/atlas/repair-qdrant-postgres-join.mjs',
  'sveltekit-frontend/scripts/atlas/repair-qdrant-postgres-match.mjs',
  'sveltekit-frontend/scripts/atlas/train-domain-classifier-naive-bayes.mts',
  'sveltekit-frontend/scripts/atlas/verify-feature-lineage.mjs',
  'sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts',
  'sveltekit-frontend/src/lib/server/retrieval/promote-results.ts',
  'sveltekit-frontend/src/lib/server/retrieval/promote-results-outbox.ts',
  'sveltekit-frontend/src/lib/server/topology/canonical-id-hierarchy.ts',
  'sveltekit-frontend/src/lib/server/unknown/promotion-executor.ts',
];

const IDENTITY_COLUMNS = ['packet_key', 'source_ref', 'feature_id'];
const PACKAGE_JSON_FILES = ['package.json', 'sveltekit-frontend/package.json'];

function readText(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  try {
    if (fs.statSync(absolute).size > 2 * 1024 * 1024) return '';
    return fs.readFileSync(absolute, 'utf8');
  } catch { return ''; }
}

function rgFiles(needle, roots) {
  try {
    const output = execFileSync(
      'rg',
      ['-l', '--hidden', '--glob', '!**/node_modules/**', '--glob', '!**/dist/**', '--glob', '!**/.git/**', '--glob', '!**/.svelte-kit/**', '--fixed-strings', '--', needle, ...roots],
      { cwd: ROOT, encoding: 'utf8', timeout: 15000 },
    );
    return output.split(/\r?\n/).map((f) => f.trim()).filter(Boolean).map((f) => f.replaceAll('\\', '/'));
  } catch {
    return []; // rg exit 1 = no match, a valid result
  }
}

function classifyOne(relativePath) {
  const source = readText(relativePath);
  const basename = path.basename(relativePath, path.extname(relativePath));
  const isRuntime = relativePath.startsWith('sveltekit-frontend/src/') || /^packages\/[^/]+\/src\//.test(relativePath);
  const isScript = relativePath.startsWith('scripts/') || relativePath.startsWith('sveltekit-frontend/scripts/');

  const targetsPackets = /(?:INSERT\s+INTO|UPDATE)\s+"?atlas_packets"?[^_]/i.test(source + ' ');
  const targetsRegistry = /(?:INSERT\s+INTO|UPDATE)\s+"?atlas_packet_registry"?/i.test(source);
  const targetTable = targetsPackets && targetsRegistry ? 'both' : targetsRegistry ? 'atlas_packet_registry' : targetsPackets ? 'atlas_packets' : 'none';

  const hasOnConflictUpdate = /ON\s+CONFLICT[\s\S]{0,300}DO\s+UPDATE/i.test(source);
  const conflictSetClauses = (source.match(/ON\s+CONFLICT[\s\S]{0,400}?(?=;|\)\s*;|`)/i) || [''])[0];
  const mutatesIdentityColumns = IDENTITY_COLUMNS.some((col) => new RegExp(`\\b${col}\\s*=`, 'i').test(conflictSetClauses)) ||
    IDENTITY_COLUMNS.some((col) => new RegExp(`INSERT\\s+INTO[\\s\\S]{0,300}\\b${col}\\b`, 'i').test(source));
  const hasDryRunGate = /dry[-_ ]run|DRY_RUN|--apply\b|APPLY_REQUESTED/i.test(source);
  const hasTransactionMarkers = /\bBEGIN\b[\s\S]{0,2000}\bCOMMIT\b/i.test(source);

  // Reachability: package.json script reference (basename match)
  const packageJsonRefs = PACKAGE_JSON_FILES.filter((f) => readText(f).includes(basename));

  // Reachability: cron/startup/docker/graphify chain reference (by basename, excluding self)
  const chainRefs = rgFiles(basename, ['scripts/startup', '.github', 'docker', 'scripts/atlas', 'sveltekit-frontend/scripts'])
    .filter((f) => f !== relativePath);

  // Reachability: live runtime import (only meaningful for isRuntime files)
  const runtimeImportRefs = isRuntime
    ? rgFiles(basename, ['sveltekit-frontend/src']).filter((f) => f !== relativePath)
    : [];

  const anyReference = packageJsonRefs.length > 0 || chainRefs.length > 0 || runtimeImportRefs.length > 0;

  let classification;
  if (!source) {
    classification = 'MISSING_FILE';
  } else if (isRuntime) {
    classification = runtimeImportRefs.length > 0 ? 'CANONICAL_WRITER_CANDIDATE' : 'PRODUCTION_CAPABLE_UNOWNED';
  } else if (!anyReference) {
    classification = 'DEAD_ORPHAN';
  } else if (targetTable === 'atlas_packet_registry') {
    classification = 'MIGRATION_ONLY';
  } else if (mutatesIdentityColumns && packageJsonRefs.length === 0 && chainRefs.length === 0) {
    classification = 'UNRESOLVED_IDENTITY_WRITER';
  } else if (!mutatesIdentityColumns) {
    classification = 'PROJECTION_WRITER';
  } else {
    classification = 'MIGRATION_ONLY';
  }

  return {
    path: relativePath,
    exists: Boolean(source),
    isRuntime,
    isScript,
    targetTable,
    hasOnConflictUpdate,
    mutatesIdentityColumns,
    hasDryRunGate,
    hasTransactionMarkers,
    packageJsonRefs,
    chainRefCount: chainRefs.length,
    runtimeImportRefs,
    classification,
  };
}

async function liveParity() {
  const env = loadRepoEnv(process.env);
  Object.assign(process.env, env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.atlas_packets) AS packets,
        (SELECT count(*)::int FROM public.atlas_packet_registry) AS registry,
        (SELECT count(*)::int FROM public.atlas_packets p LEFT JOIN public.atlas_packet_registry r ON r.packet_key = p.packet_key WHERE r.packet_key IS NULL) AS packets_missing_registry_row,
        (SELECT count(*)::int FROM public.atlas_packet_registry r LEFT JOIN public.atlas_packets p ON p.packet_key = r.packet_key WHERE p.packet_key IS NULL) AS orphan_registry_rows,
        (SELECT count(*)::int FROM (SELECT packet_key FROM public.atlas_packet_registry GROUP BY packet_key HAVING count(*) > 1) d) AS duplicate_registry_keys
    `);
    return result.rows[0];
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const writers = CANDIDATES.map(classifyOne);
  let parity;
  try { parity = await liveParity(); } catch (error) {
    parity = { error: String(error?.message ?? error) };
  }

  const canonicalWriters = writers.filter((w) => w.classification === 'CANONICAL_WRITER_CANDIDATE');
  const unownedRuntime = writers.filter((w) => w.classification === 'PRODUCTION_CAPABLE_UNOWNED');
  const unresolvedIdentityWriters = writers.filter((w) => w.classification === 'UNRESOLVED_IDENTITY_WRITER');
  const deadOrphans = writers.filter((w) => w.classification === 'DEAD_ORPHAN');
  const dryRunReachableMutationPaths = writers.filter((w) => w.isScript && !w.hasDryRunGate && (w.packageJsonRefs.length > 0 || w.chainRefCount > 0));

  const classificationCounts = writers.reduce((out, w) => { out[w.classification] = (out[w.classification] ?? 0) + 1; return out; }, {});

  const report = {
    schema: 'atlas.packet-registry-writer-ownership.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    candidateCount: CANDIDATES.length,
    candidateDiscoveryCommand: "rg -l -E '(INSERT INTO \"?atlas_packets\"?[^_]|UPDATE \"?atlas_packets\"?[^_]|INSERT INTO \"?atlas_packet_registry\"?|UPDATE \"?atlas_packet_registry\"?)' --include='*.mjs' --include='*.mts' --include='*.ts' scripts/ sveltekit-frontend/src/ sveltekit-frontend/scripts/ packages/",
    liveParity: parity,
    canonicalInvariant: 'atlas_packets.packet_key must equal atlas_packet_registry.packet_key; the registry is an admitted projection/index, not an identity generator',
    gate: 'PACKET_REGISTRY_WRITER_OWNERSHIP_01',
    acceptance: {
      exactlyOneRuntimeCanonicalWriter: canonicalWriters.length === 1,
      runtimeCanonicalWriterCount: canonicalWriters.length,
      productionCapableUnownedCount: unownedRuntime.length,
      competingIdentityDerivations: unresolvedIdentityWriters.length,
      unexplainedRegistryWriters: writers.filter((w) => w.classification === 'MISSING_FILE').length,
      dryRunReachableMutationPathCount: dryRunReachableMutationPaths.length,
      deadOrphanCount: deadOrphans.length,
      packetKeyDerivationOwnerExplicit: canonicalWriters.length === 1,
      sourceRevisionOwnerExplicit: false,
      workspaceRevisionOwnerExplicit: false,
      conflictPolicyOwnerExplicit: canonicalWriters.length === 1 && canonicalWriters[0]?.hasOnConflictUpdate === true,
    },
    classificationCounts,
    canonicalWriterCandidates: canonicalWriters.map((w) => w.path),
    productionCapableUnowned: unownedRuntime.map((w) => w.path),
    unresolvedIdentityWriters: unresolvedIdentityWriters.map((w) => w.path),
    dryRunReachableMutationPaths: dryRunReachableMutationPaths.map((w) => w.path),
    deadOrphans: deadOrphans.map((w) => w.path),
    writerInventory: writers,
    nextGate: 'PACKET_WRITE_REVISION_CONTRACT_01',
    nextAction: 'Do not execute any writer or backfill. Review canonicalWriterCandidates and unresolvedIdentityWriters; confirm or reject the single canonical runtime owner before defining CanonicalPacketWriteV1.',
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'PACKET_REGISTRY_WRITER_OWNERSHIP_READ_ONLY_COMPLETE',
    parity,
    classificationCounts,
    canonicalWriterCandidates: report.canonicalWriterCandidates,
    productionCapableUnowned: report.productionCapableUnowned,
    unresolvedIdentityWriterCount: unresolvedIdentityWriters.length,
    deadOrphanCount: deadOrphans.length,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'PACKET_REGISTRY_WRITER_OWNERSHIP_FAILED', error: String(error?.message ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
