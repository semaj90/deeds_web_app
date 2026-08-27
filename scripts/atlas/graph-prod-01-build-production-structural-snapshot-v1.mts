import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createFeatureIntelligenceRepository } = await import('../../packages/parent-atlas/dist/core/feature-intelligence-repository.js');
const { featureRelationshipToKernel } = await import('../../packages/parent-atlas/dist/core/relationship-kernel.js');
const { readAllHyperedgesFromPostgres } = await import('../../sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts');
const { hyperedgeToRelationshipKernel } = await import('../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts');
const { buildIncidenceProjectionFromRelationshipKernelsV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-projection-v1.ts');
const { buildStructuralGraphSnapshotFromIncidenceV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/structural-graph-snapshot-from-incidence-v1.ts');
const { serializeIncidenceEdgesToArrowIpc, checksumArrowIpc } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.ts');
const { buildGraphRevisionV1 } = await import('./lib/graph-revision-v1.mjs');

/**
 * GRAPH-PROD-01: the first *production* StructuralGraphSnapshotV1 builder —
 * reads real HyperedgeV1 rows (atlas_hyperedges) and real FeatureRelationshipV1
 * rows (atlas_relationships) from Postgres, converts both through their
 * respective adapters into the shared RelationshipKernelV1, projects them into
 * one incidence graph, and emits a real Arrow IPC edge artifact.
 *
 * The source tables contain real historical rows. This builder excludes any
 * kernel whose workspace revision is not the explicitly requested current
 * revision, so a stale corpus produces an honest non-authoritative empty
 * snapshot instead of being relabeled as current evidence.
 *
 * A kernel whose workspaceRevision does not match --workspace-revision is
 * EXCLUDED from the snapshot (not a fatal error) and counted in the report —
 * buildIncidenceProjectionFromRelationshipKernelsV1 throws on ANY mismatch
 * across a whole batch, so a real multi-revision production corpus must be
 * pre-filtered to one revision before reaching it.
 */

const { Pool } = pg;

function parseRequiredArg(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  const value = found?.slice(prefix.length).trim();
  if (!value) throw new Error(`GRAPH_PROD_ARG_REQUIRED:--${name}=...`);
  return value;
}

async function main() {
  const workspaceRevision = parseRequiredArg('workspace-revision');
  const candidateSnapshotRevision = parseRequiredArg('candidate-snapshot-revision');
  const ordinalMapChecksum = parseRequiredArg('ordinal-map-checksum');
  if (process.argv.some((value) => value.startsWith('--graph-revision='))) {
    throw new Error('GRAPH_PROD_GRAPH_REVISION_DERIVED_ONLY');
  }

  const report: Record<string, unknown> = {
    schema: 'atlas.graph-prod-01.production-snapshot-build.v1',
    workspaceRevision,
    candidateSnapshotRevision,
    ordinalMapChecksum,
  };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [hyperedges, relationships] = await Promise.all([
      readAllHyperedgesFromPostgres(),
      createFeatureIntelligenceRepository(pool).listAllRelationships(5000),
    ]);
    report.realHyperedgesRead = hyperedges.length;
    report.realFeatureRelationshipsRead = relationships.length;

    const kagKernels = hyperedges.map((edge: any) => hyperedgeToRelationshipKernel(edge));
    const fiKernels = relationships.map((rel: any) => featureRelationshipToKernel(rel));
    const allKernels = [...kagKernels, ...fiKernels];

    const included = allKernels.filter((kernel) => kernel.workspaceRevision === workspaceRevision);
    const excludedByRevision = allKernels.length - included.length;
    report.kernelsBuilt = allKernels.length;
    report.kernelsIncluded = included.length;
    report.kernelsExcludedByRevisionMismatch = excludedByRevision;
    const graphIdentity = buildGraphRevisionV1({ workspaceRevision, kernels: included });
    const graphRevision = graphIdentity.graphRevision;
    report.graphRevision = graphRevision;
    report.graphIdentity = graphIdentity;

    const entityIds = new Set<string>();
    const entities: Array<{ canonicalId: string; nodeKind: string }> = [];
    for (const kernel of included) {
      for (const participant of kernel.participants) {
        if (entityIds.has(participant.canonicalId)) continue;
        entityIds.add(participant.canonicalId);
        entities.push({ canonicalId: participant.canonicalId, nodeKind: participant.entityType ?? 'unknown' });
      }
    }

    const projection = buildIncidenceProjectionFromRelationshipKernelsV1({
      workspaceRevision,
      projectionRevision: `proj:${graphRevision}`,
      entities,
      kernels: included,
    });
    report.projection = {
      entityCount: projection.entityCount,
      relationCount: projection.relationCount,
      unresolvedParticipantCount: projection.unresolvedParticipantCount,
      nodeTableHash: projection.nodeTableHash,
      edgeTableHash: projection.edgeTableHash,
      projectionHash: projection.projectionHash,
    };

    const edgeBytes = serializeIncidenceEdgesToArrowIpc(projection.edges);
    const artifactChecksum = checksumArrowIpc(edgeBytes);
    const artifactPath = resolve(REPO_ROOT, `docs/reports/graph-artifacts/structural-graph-snapshot-${graphRevision.replace(/[^a-zA-Z0-9_-]/g, '_')}.arrow`);
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, edgeBytes);
    report.edgeArtifactPath = artifactPath;
    report.edgeArtifactBytes = edgeBytes.length;
    report.edgeArtifactChecksum = artifactChecksum;

    const snapshot = buildStructuralGraphSnapshotFromIncidenceV1({
      projection,
      graphRevision,
      candidateSnapshotRevision,
      ordinalMapChecksum,
      edgeArtifact: { format: 'ARROW_IPC', checksum: artifactChecksum, ref: artifactPath },
    });
    report.snapshot = snapshot;

    // GRAPH-PROD-02 (determinism): rebuild the same edge artifact from the
    // same projection and confirm the checksum is reproducible before
    // trusting this as a canonical revision-bound artifact.
    const secondPassBytes = serializeIncidenceEdgesToArrowIpc(projection.edges);
    const secondPassChecksum = checksumArrowIpc(secondPassBytes);
    report.artifactChecksumDeterministic = secondPassChecksum === artifactChecksum;

    const receiptPath = resolve(REPO_ROOT, `docs/reports/graph-prod-01-production-snapshot-${graphRevision.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    writeFileSync(receiptPath, JSON.stringify(report, null, 2));
    report.receiptPath = receiptPath;
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.artifactChecksumDeterministic) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
