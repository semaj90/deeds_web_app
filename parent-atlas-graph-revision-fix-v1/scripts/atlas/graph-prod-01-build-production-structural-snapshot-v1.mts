import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  assertGraphRevisionV1,
  buildGraphRevisionV1,
} from './lib/graph-revision-v1.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createFeatureIntelligenceRepository } = await import(
  '../../packages/parent-atlas/dist/core/feature-intelligence-repository.js'
);
const { featureRelationshipToKernel } = await import(
  '../../packages/parent-atlas/dist/core/relationship-kernel.js'
);
const { readAllHyperedgesFromPostgres } = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/kag-hyperedge-postgres.ts'
);
const { hyperedgeToRelationshipKernel } = await import(
  '../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts'
);
const { buildIncidenceProjectionFromRelationshipKernelsV1 } = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-projection-v1.ts'
);
const { buildStructuralGraphSnapshotFromIncidenceV1 } = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/graph/structural-graph-snapshot-from-incidence-v1.ts'
);
const {
  serializeIncidenceEdgesToArrowIpc,
  checksumArrowIpc,
} = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.ts'
);
const {
  candidateOrdinalMapV1Schema,
  candidateOrdinalMapChecksum,
} = await import(
  '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts'
);

const { Pool } = pg;

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  const value = found?.slice(prefix.length).trim();
  if (!value) throw new Error(`GRAPH_PROD_01_REQUIRED_ARG:${name}`);
  return value;
}

function resolveInput(value: string): string {
  return isAbsolute(value) ? value : resolve(REPO_ROOT, value);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function verifyCandidateMap(raw: unknown, workspaceRevision: string) {
  const map = candidateOrdinalMapV1Schema.parse(raw);
  if (map.workspaceRevision !== workspaceRevision) {
    throw new Error(
      `GRAPH_PROD_01_CANDIDATE_WORKSPACE_MISMATCH:${map.workspaceRevision}:${workspaceRevision}`,
    );
  }
  if (map.rowCount !== map.candidates.length) {
    throw new Error('GRAPH_PROD_01_CANDIDATE_ROW_COUNT_MISMATCH');
  }
  map.candidates.forEach((candidate, index) => {
    if (candidate.candidateOrdinal !== index) {
      throw new Error(`GRAPH_PROD_01_CANDIDATE_ORDINAL_CORRUPT:${index}`);
    }
    if (candidate.workspaceRevision !== map.workspaceRevision) {
      throw new Error(`GRAPH_PROD_01_CANDIDATE_WORKSPACE_ROW_MISMATCH:${index}`);
    }
    if (candidate.candidateSnapshotRevision !== map.candidateSnapshotRevision) {
      throw new Error(`GRAPH_PROD_01_CANDIDATE_SNAPSHOT_ROW_MISMATCH:${index}`);
    }
  });

  const expected = candidateOrdinalMapChecksum({
    candidateSnapshotRevision: map.candidateSnapshotRevision,
    workspaceRevision: map.workspaceRevision,
    candidates: map.candidates,
  });
  if (expected !== map.ordinalMapChecksum) {
    throw new Error(
      `GRAPH_PROD_01_CANDIDATE_CHECKSUM_MISMATCH:${map.ordinalMapChecksum}:${expected}`,
    );
  }
  return map;
}

async function main() {
  const workspaceRevision = requiredArg('workspace-revision');
  const candidateMapPath = resolveInput(requiredArg('candidate-map'));
  const graphReceiptPath = resolveInput(requiredArg('graph-revision-receipt'));

  // Fail before graph artifact materialization if either independent coordinate
  // cannot be proven.
  const candidateMap = verifyCandidateMap(readJson(candidateMapPath), workspaceRevision);
  const graphReceipt: any = readJson(graphReceiptPath);
  if (!graphReceipt || !String(graphReceipt.graphRevision ?? '').trim()) {
    throw new Error('GRAPH_PROD_01_GRAPH_REVISION_RECEIPT_INVALID');
  }

  const expectedGraph = assertGraphRevisionV1({
    schema: 'atlas.graph-revision.v1',
    workspaceRevision: graphReceipt.workspaceRevision,
    graphRevision: graphReceipt.graphRevision,
    relationshipCount: graphReceipt.relationshipCount,
    relationshipSetChecksum: graphReceipt.relationshipSetChecksum,
    relationshipPolicyRevision: graphReceipt.relationshipPolicyRevision,
    projectionSchemaRevision: graphReceipt.projectionSchemaRevision,
  });

  if (expectedGraph.workspaceRevision !== workspaceRevision) {
    throw new Error(
      `GRAPH_PROD_01_GRAPH_WORKSPACE_MISMATCH:${expectedGraph.workspaceRevision}:${workspaceRevision}`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [hyperedges, relationships] = await Promise.all([
      readAllHyperedgesFromPostgres(),
      createFeatureIntelligenceRepository(pool).listAllRelationships(1000000),
    ]);

    const allKernels = [
      ...hyperedges.map((edge: any) => hyperedgeToRelationshipKernel(edge)),
      ...relationships.map((rel: any) => featureRelationshipToKernel(rel)),
    ];
    const included = allKernels.filter(
      (kernel: any) => kernel.workspaceRevision === workspaceRevision,
    );

    const recomputedGraph = buildGraphRevisionV1({
      workspaceRevision,
      relationshipPolicyRevision: expectedGraph.relationshipPolicyRevision,
      projectionSchemaRevision: expectedGraph.projectionSchemaRevision,
      kernels: included,
    });

    if (
      recomputedGraph.graphRevision !== expectedGraph.graphRevision ||
      recomputedGraph.relationshipSetChecksum !== expectedGraph.relationshipSetChecksum
    ) {
      throw new Error('GRAPH_PROD_01_GRAPH_REVISION_READBACK_MISMATCH');
    }

    const entityIds = new Set<string>();
    const entities: Array<{ canonicalId: string; nodeKind: string }> = [];
    for (const kernel of included) {
      for (const participant of kernel.participants) {
        if (entityIds.has(participant.canonicalId)) continue;
        entityIds.add(participant.canonicalId);
        entities.push({
          canonicalId: participant.canonicalId,
          nodeKind: participant.entityType ?? 'unknown',
        });
      }
    }

    const projection = buildIncidenceProjectionFromRelationshipKernelsV1({
      workspaceRevision,
      projectionRevision: `projection:${recomputedGraph.graphRevision}`,
      entities,
      kernels: included,
    });

    const edgeBytes = serializeIncidenceEdgesToArrowIpc(projection.edges);
    const artifactChecksum = checksumArrowIpc(edgeBytes);
    const safeGraphRevision = recomputedGraph.graphRevision.replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    );
    const artifactPath = resolve(
      REPO_ROOT,
      `docs/reports/graph-artifacts/structural-graph-snapshot-${safeGraphRevision}.arrow`,
    );
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, edgeBytes);

    const snapshot = buildStructuralGraphSnapshotFromIncidenceV1({
      projection,
      graphRevision: recomputedGraph.graphRevision,
      candidateBinding: {
        workspaceRevision: candidateMap.workspaceRevision,
        candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
        ordinalMapChecksum: candidateMap.ordinalMapChecksum,
        rowCount: candidateMap.rowCount,
      },
      edgeArtifact: {
        format: 'ARROW_IPC',
        checksum: artifactChecksum,
        ref: artifactPath,
      },
    });

    const secondPassBytes = serializeIncidenceEdgesToArrowIpc(projection.edges);
    const secondPassChecksum = checksumArrowIpc(secondPassBytes);
    if (secondPassChecksum !== artifactChecksum) {
      throw new Error('GRAPH_PROD_01_ARROW_ARTIFACT_NONDETERMINISTIC');
    }

    const report = {
      schema: 'atlas.graph-prod-01.production-snapshot-build.v2',
      status:
        recomputedGraph.relationshipCount === 0
          ? 'STRUCTURAL_GRAPH_PROVEN_EMPTY_CURRENT_RELATIONSHIP_SET'
          : 'STRUCTURAL_GRAPH_SNAPSHOT_BUILT',
      workspaceRevision,
      graphRevision: recomputedGraph.graphRevision,
      relationshipSetChecksum: recomputedGraph.relationshipSetChecksum,
      relationshipCount: recomputedGraph.relationshipCount,
      historicalRelationshipsExcluded: allKernels.length - included.length,
      candidateBinding: {
        candidateSnapshotRevision: candidateMap.candidateSnapshotRevision,
        ordinalMapChecksum: candidateMap.ordinalMapChecksum,
        candidateRowCount: candidateMap.rowCount,
      },
      projection: {
        entityCount: projection.entityCount,
        relationCount: projection.relationCount,
        unresolvedParticipantCount: projection.unresolvedParticipantCount,
        nodeTableHash: projection.nodeTableHash,
        edgeTableHash: projection.edgeTableHash,
        projectionHash: projection.projectionHash,
      },
      edgeArtifactPath: artifactPath,
      edgeArtifactBytes: edgeBytes.length,
      edgeArtifactChecksum: artifactChecksum,
      artifactChecksumDeterministic: true,
      snapshot,
      writes: {
        postgres: false,
        qdrant: false,
        neo4j: false,
        valkey: false,
      },
    };

    const receiptPath = resolve(
      REPO_ROOT,
      `docs/reports/graph-prod-01-production-snapshot-${safeGraphRevision}.json`,
    );
    writeFileSync(receiptPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...report, receiptPath }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
