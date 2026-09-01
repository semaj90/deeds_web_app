import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { HyperedgeV1Schema } = await import('../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts');
const { hyperedgeToRelationshipKernel } = await import('../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts');
const { featureRelationshipSchema } = await import('../../packages/parent-atlas/dist/core/feature-intelligence.js');
const { featureRelationshipToKernel } = await import('../../packages/parent-atlas/dist/core/relationship-kernel.js');
const { buildIncidenceProjectionFromRelationshipKernelsV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-projection-v1.ts');
const { serializeIncidenceEdgesToArrowIpc, checksumArrowIpc } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.ts');
const { buildGraphRevisionV1, canonicalJson } = await import('./lib/graph-revision-v1.mjs');

const { Pool } = pg;

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) throw new Error(`GRAPH_RO_REPLAY_ARG_REQUIRED:--${name}=...`);
  return value;
}

function integerArg(name: string, fallback: number, max: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`GRAPH_RO_REPLAY_INVALID_${name.replace(/-/g, '_').toUpperCase()}:${String(raw ?? fallback)}`);
  }
  return value;
}

function sha256Canonical(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

async function tableExists(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`],
  );
  return result.rows[0]?.exists === true;
}

async function readHyperedges(client: PoolClient, maxRelationships: number) {
  if (!(await tableExists(client, 'atlas_hyperedges'))) return [];
  if (!(await tableExists(client, 'atlas_hyperedge_members'))) return [];

  const countResult = await client.query<{ count: string }>(`
    SELECT count(*)::text AS count
    FROM atlas_hyperedges
    WHERE contract_hyperedge_id IS NOT NULL
  `);
  const count = Number(countResult.rows[0]?.count ?? '0');
  if (count > maxRelationships) {
    throw new Error(`GRAPH_RO_REPLAY_HYPEREDGE_LIMIT_EXCEEDED:${count}>${maxRelationships}`);
  }

  const result = await client.query<QueryResultRow>(`
    SELECT h.hyperedge_id,
           h.contract_hyperedge_id,
           h.relation_type,
           h.workspace_revision,
           h.source_revision,
           h.graph_revision,
           h.producer_revision,
           h.evidence_refs,
           h.checksum,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'member_id', m.member_id,
               'member_role', m.member_role,
               'ordinal', m.ordinal
             ) ORDER BY m.ordinal, m.member_role, m.member_id)
             FROM atlas_hyperedge_members m
             WHERE m.hyperedge_id = h.hyperedge_id
           ), '[]'::jsonb) AS members
    FROM atlas_hyperedges h
    WHERE h.contract_hyperedge_id IS NOT NULL
    ORDER BY h.contract_hyperedge_id
    LIMIT $1
  `, [maxRelationships]);

  return result.rows.map((row) => HyperedgeV1Schema.parse({
    schemaVersion: 'atlas.hyperedge.v1',
    hyperedgeId: String(row.contract_hyperedge_id),
    predicate: String(row.relation_type),
    participants: (row.members as Array<Record<string, unknown>>).map((member) => ({
      canonicalId: String(member.member_id),
      role: String(member.member_role),
      ordinal: Number(member.ordinal),
    })),
    evidenceRefs: row.evidence_refs ?? [],
    workspaceRevision: String(row.workspace_revision),
    graphRevision: String(row.graph_revision),
    sourceRevision: String(row.source_revision),
    producerRevision: String(row.producer_revision),
    checksum: String(row.checksum),
  }));
}

async function readFeatureRelationships(client: PoolClient, maxRelationships: number) {
  if (!(await tableExists(client, 'atlas_relationships'))) return [];
  const required = [
    'atlas_relationship_members',
    'atlas_relationship_cardinality',
    'atlas_relationship_evidence',
  ];
  for (const tableName of required) {
    if (!(await tableExists(client, tableName))) {
      throw new Error(`GRAPH_RO_REPLAY_FI_TABLE_MISSING:${tableName}`);
    }
  }

  const countResult = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM atlas_relationships`);
  const count = Number(countResult.rows[0]?.count ?? '0');
  if (count > maxRelationships) {
    throw new Error(`GRAPH_RO_REPLAY_FEATURE_RELATIONSHIP_LIMIT_EXCEEDED:${count}>${maxRelationships}`);
  }

  const result = await client.query<QueryResultRow>(`
    SELECT r.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'role', m.role, 'entity_type', m.entity_type, 'entity_id', m.entity_id,
        'entity_revision', m.entity_revision, 'source_ref', m.source_ref
      ) ORDER BY m.member_ordinal) FROM atlas_relationship_members m
        WHERE m.relationship_id = r.relationship_id), '[]'::jsonb) AS participants,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'role', c.role, 'min', c.minimum_count,
        'max', CASE WHEN c.maximum_count IS NULL THEN 'many'::text ELSE c.maximum_count::text END
      ) ORDER BY c.role) FROM atlas_relationship_cardinality c
        WHERE c.relationship_id = r.relationship_id), '[]'::jsonb) AS cardinality,
      COALESCE((SELECT jsonb_agg(re.evidence_id ORDER BY re.evidence_id)
        FROM atlas_relationship_evidence re WHERE re.relationship_id = r.relationship_id), '[]'::jsonb) AS evidence_refs
    FROM atlas_relationships r
    ORDER BY r.relationship_id
    LIMIT $1
  `, [maxRelationships]);

  return result.rows.map((row) => featureRelationshipSchema.parse({
    schema: 'atlas.feature-relationship.v1',
    relationship_id: String(row.relationship_id),
    relationship_type: String(row.relationship_type),
    participant_count: Number(row.participant_count),
    relationship_degree: Number(row.relationship_degree),
    relationship_degree_kind: String(row.relationship_degree_kind),
    participants: row.participants,
    cardinality: (row.cardinality as Array<Record<string, unknown>>).map((item) => ({
      role: item.role,
      min: Number(item.min),
      max: item.max === 'many' ? 'many' : Number(item.max),
    })),
    source_ref: String(row.source_ref),
    source_revision: String(row.source_revision),
    relationship_revision: String(row.relationship_revision),
    producer_revision: String(row.producer_revision),
    evidence_refs: row.evidence_refs,
    confidence: Number(row.confidence),
    metadata: row.metadata ?? {},
  }));
}

async function buildPass(pool: pg.Pool, args: {
  workspaceRevision: string;
  maxRelationships: number;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tx = await client.query<{
      pg_snapshot: string;
      isolation: string;
      read_only: string;
    }>(`
      SELECT pg_current_snapshot()::text AS pg_snapshot,
             current_setting('transaction_isolation') AS isolation,
             current_setting('transaction_read_only') AS read_only
    `);

    if (tx.rows[0]?.isolation !== 'repeatable read') {
      throw new Error(`GRAPH_RO_REPLAY_ISOLATION_UNEXPECTED:${String(tx.rows[0]?.isolation)}`);
    }
    if (tx.rows[0]?.read_only !== 'on') {
      throw new Error(`GRAPH_RO_REPLAY_READ_ONLY_NOT_ENFORCED:${String(tx.rows[0]?.read_only)}`);
    }

    // Sequential reads are deliberate: both are guaranteed to observe the same
    // REPEATABLE READ snapshot on this one physical PostgreSQL connection.
    const hyperedges = await readHyperedges(client, args.maxRelationships);
    const relationships = await readFeatureRelationships(client, args.maxRelationships);

    const kernels = [
      ...hyperedges.map((edge: any) => hyperedgeToRelationshipKernel(edge)),
      ...relationships.map((relationship: any) => featureRelationshipToKernel(relationship)),
    ];

    const included = kernels.filter((kernel: any) => kernel.workspaceRevision === args.workspaceRevision);
    const missingWorkspace = kernels.filter((kernel: any) => !kernel.workspaceRevision);
    const mismatchedWorkspace = kernels.filter((kernel: any) =>
      Boolean(kernel.workspaceRevision) && kernel.workspaceRevision !== args.workspaceRevision
    );

    const graphIdentity = buildGraphRevisionV1({
      workspaceRevision: args.workspaceRevision,
      kernels: included,
      projectionSchemaRevision: 'atlas.relationship-incidence-projection.v1',
    });

    const entityMap = new Map<string, { canonicalId: string; nodeKind: string }>();
    for (const kernel of included) {
      for (const participant of kernel.participants) {
        if (!entityMap.has(participant.canonicalId)) {
          entityMap.set(participant.canonicalId, {
            canonicalId: participant.canonicalId,
            nodeKind: participant.entityType ?? 'unknown',
          });
        }
      }
    }

    const projection = buildIncidenceProjectionFromRelationshipKernelsV1({
      workspaceRevision: args.workspaceRevision,
      projectionRevision: `proj:${graphIdentity.graphRevision}`,
      entities: [...entityMap.values()],
      kernels: included,
    });
    const arrowBytes = serializeIncidenceEdgesToArrowIpc(projection.edges);
    const edgeArtifactChecksum = checksumArrowIpc(arrowBytes);

    const deterministicPayload = {
      graphRevision: graphIdentity.graphRevision,
      relationshipSetChecksum: graphIdentity.relationshipSetChecksum,
      relationshipCount: graphIdentity.relationshipCount,
      authoritySet: graphIdentity.authoritySet,
      relationshipProducerRevisions: graphIdentity.relationshipProducerRevisions,
      projection: {
        entityCount: projection.entityCount,
        relationCount: projection.relationCount,
        unresolvedParticipantCount: projection.unresolvedParticipantCount,
        nodeTableHash: projection.nodeTableHash,
        edgeTableHash: projection.edgeTableHash,
        projectionHash: projection.projectionHash,
      },
      edgeArtifactChecksum,
    };

    await client.query('ROLLBACK');
    return {
      pgSnapshot: tx.rows[0].pg_snapshot,
      transactionIsolation: tx.rows[0].isolation,
      transactionReadOnly: tx.rows[0].read_only,
      hyperedgesRead: hyperedges.length,
      featureRelationshipsRead: relationships.length,
      kernelsBuilt: kernels.length,
      kernelsIncluded: included.length,
      kernelsExcludedMissingWorkspace: missingWorkspace.length,
      kernelsExcludedWorkspaceMismatch: mismatchedWorkspace.length,
      graphIdentity,
      projection: deterministicPayload.projection,
      edgeArtifactChecksum,
      deterministicPassChecksum: sha256Canonical(deterministicPayload),
      writesPerformed: false,
      canonicalAuthority: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const workspaceRevision = requiredArg('workspace-revision');
  const candidateSnapshotRevision = requiredArg('candidate-snapshot-revision');
  const ordinalMapChecksum = requiredArg('ordinal-map-checksum');
  const maxRelationships = integerArg('max-relationships', 100000, 1000000);

  if (!/^sha256:[0-9a-f]{64}$/i.test(ordinalMapChecksum)) {
    throw new Error('GRAPH_RO_REPLAY_ORDINAL_MAP_CHECKSUM_INVALID');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const passA = await buildPass(pool, { workspaceRevision, maxRelationships });
    const passB = await buildPass(pool, { workspaceRevision, maxRelationships });

    const deterministic = passA.deterministicPassChecksum === passB.deterministicPassChecksum;
    const graphRevisionEqual = passA.graphIdentity.graphRevision === passB.graphIdentity.graphRevision;
    const relationshipSetEqual = passA.graphIdentity.relationshipSetChecksum === passB.graphIdentity.relationshipSetChecksum;
    const projectionEqual = passA.projection.projectionHash === passB.projection.projectionHash;
    const edgeArtifactEqual = passA.edgeArtifactChecksum === passB.edgeArtifactChecksum;

    const report = {
      schema: 'atlas.relationship-graph-readonly-replay.v1',
      status: deterministic && graphRevisionEqual && relationshipSetEqual && projectionEqual && edgeArtifactEqual
        ? 'READONLY_REPLAY_PROVEN'
        : 'READONLY_REPLAY_MISMATCH',
      workspaceRevision,
      candidateSnapshotRevision,
      ordinalMapChecksum,
      maxRelationships,
      passA,
      passB,
      replay: {
        separateDatabaseSnapshots: passA.pgSnapshot !== passB.pgSnapshot,
        deterministicExecutionChecksumEqual: deterministic,
        graphRevisionEqual,
        relationshipSetChecksumEqual: relationshipSetEqual,
        projectionHashEqual: projectionEqual,
        edgeArtifactChecksumEqual: edgeArtifactEqual,
      },
      receipt: {
        schema: 'atlas.graph-projection-receipt.v1',
        graphRevision: passA.graphIdentity.graphRevision,
        relationshipSetChecksum: passA.graphIdentity.relationshipSetChecksum,
        candidateSnapshotRevision,
        ordinalMapChecksum,
        projectionHash: passA.projection.projectionHash,
        nodeTableHash: passA.projection.nodeTableHash,
        edgeTableHash: passA.projection.edgeTableHash,
        edgeArtifactChecksum: passA.edgeArtifactChecksum,
        writesPerformed: false,
        canonicalAuthority: false,
      },
      claims: {
        sourceRevisionAuthorityProven: false,
        candidateOrdinalAuthorityChanged: false,
        semanticProjectionIdentityProven: false,
        graphRevisionDerivedOnlyFromIncludedRelationshipKernels: true,
      },
    };

    report.receipt['deterministicExecutionChecksum'] = sha256Canonical({
      workspaceRevision,
      candidateSnapshotRevision,
      ordinalMapChecksum,
      graphRevision: report.receipt.graphRevision,
      relationshipSetChecksum: report.receipt.relationshipSetChecksum,
      projectionHash: report.receipt.projectionHash,
      nodeTableHash: report.receipt.nodeTableHash,
      edgeTableHash: report.receipt.edgeTableHash,
      edgeArtifactChecksum: report.receipt.edgeArtifactChecksum,
      writesPerformed: false,
      canonicalAuthority: false,
    });

    const reportPath = resolve(REPO_ROOT, 'docs/reports/relationship-graph-readonly-replay-v1.json');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      status: report.status,
      graphRevision: report.receipt.graphRevision,
      projectionHash: report.receipt.projectionHash,
      reportPath,
    }, null, 2));

    if (report.status !== 'READONLY_REPLAY_PROVEN') process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
