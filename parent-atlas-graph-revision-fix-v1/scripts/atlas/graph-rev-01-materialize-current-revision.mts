import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildGraphRevisionV1 } from './lib/graph-revision-v1.mjs';

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

const { Pool } = pg;

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  const value = found?.slice(prefix.length).trim();
  if (!value) throw new Error(`GRAPH_REV_01_REQUIRED_ARG:${name}`);
  return value;
}

async function main() {
  const workspaceRevision = requiredArg('workspace-revision');
  const relationshipPolicyRevision = requiredArg('relationship-policy-revision');
  const projectionSchemaRevision = requiredArg('projection-schema-revision');

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

    const currentWorkspace = allKernels.filter(
      (kernel: any) => kernel.workspaceRevision === workspaceRevision,
    );
    const excludedOtherWorkspace = allKernels.length - currentWorkspace.length;

    // Current-workspace rows must be fully relationship-qualified. Historical
    // or other-workspace rows are excluded, never restamped.
    const graph = buildGraphRevisionV1({
      workspaceRevision,
      relationshipPolicyRevision,
      projectionSchemaRevision,
      kernels: currentWorkspace,
    });

    const report = {
      schema: 'atlas.graph-rev-01.current-relationship-revision-receipt.v1',
      status:
        graph.relationshipCount === 0
          ? 'GRAPH_REVISION_OWNER_PROVEN_CURRENT_RELATIONSHIP_CORPUS_EMPTY'
          : 'GRAPH_REVISION_OWNER_PROVEN',
      readOnly: true,
      workspaceRevision,
      relationshipPolicyRevision,
      projectionSchemaRevision,
      graphRevision: graph.graphRevision,
      relationshipSetChecksum: graph.relationshipSetChecksum,
      relationshipCount: graph.relationshipCount,
      inputRelationshipCount: allKernels.length,
      excludedOtherWorkspace,
      duplicateExactCount: graph.duplicateExactCount,
      historicalRelationshipsExcluded: excludedOtherWorkspace,
      candidateSnapshotRequired: false,
      canonicalWritesAllowed: false,
      writes: {
        postgres: false,
        qdrant: false,
        neo4j: false,
        valkey: false,
      },
    };

    const safe = graph.graphRevision.replace(/[^a-zA-Z0-9_-]/g, '_');
    const out = resolve(
      REPO_ROOT,
      `docs/reports/graph-rev-01-current-${safe}.json`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({ ...report, reportPath: out }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
