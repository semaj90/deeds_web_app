import neo4j from 'neo4j-driver';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { createHyperedgeV1, hyperedgeToRelationshipKernel } = await import('../../sveltekit-frontend/src/lib/server/graph/hyperedge-contract.ts');
const { buildFeatureRelationship } = await import('../../packages/parent-atlas/dist/core/feature-intelligence.js');
const { featureRelationshipToKernel } = await import('../../packages/parent-atlas/dist/core/relationship-kernel.js');
const { projectRelationshipKernelsToNeo4j } = await import('../../sveltekit-frontend/src/lib/server/atlas/graph/relationship-kernel-neo4j-projector-v1.ts');

// NOT using $lib/server/neo4j-driver.js::getNeo4jDriver() here: it reads
// NEO4J_PASSWORD via SvelteKit's $env/dynamic/private, which is unpopulated
// outside an actual SvelteKit runtime (confirmed live: bare tsx produced
// "Unsupported authentication token, missing key `credentials`" because
// ENV.NEO4J_PASSWORD resolved to undefined). loadRepoEnv() reads the same
// .env files directly, same pattern this session already uses for DATABASE_URL.
const repoEnv = loadRepoEnv(process.env);
const neo4jUri = repoEnv.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
const neo4jUser = repoEnv.NEO4J_USER ?? 'neo4j';
const neo4jPassword = repoEnv.NEO4J_PASSWORD;
if (!neo4jPassword) throw new Error('NEO4J_PASSWORD not found in .env — cannot authenticate for this proof');

/**
 * Live proof for "find a way to wire up" (2026-08-26): projects a synthetic
 * KAG_TAXONOMY kernel (binary — the real shape both real KAG predicates
 * always have) and a synthetic FEATURE_INTELLIGENCE kernel (ternary — proves
 * the non-flattening hub-node path, since real FI relationships CAN be N-ary)
 * into real Neo4j, reads them back via real Cypher, then deletes everything
 * this proof created and verifies zero residue.
 *
 * Uses synthetic data deliberately — atlas_hyperedges/atlas_relationships
 * both have 0 real rows as of this session (see
 * openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
 * This proves the projector mechanism, not a real capability yet.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const report: Record<string, unknown> = { schema: 'atlas.relationship-kernel-neo4j-projector-live-proof.v1' };
  const marker = 'rk-neo4j-proof';
  const entityKey = `entity:${marker}:file-x`;
  const conceptKey0 = `concept:${marker}:retrieval`;

  // Real role names, matching entity-concept-taxonomy-v1.ts::promoteTaxonomyAssignmentV1
  // exactly ('entity'/'concept', not 'subject'/'object' — a synthetic-fixture
  // mistake in an earlier version of this proof that masked the real bug below).
  const binaryHyperedge = createHyperedgeV1({
    predicate: 'ENTITY_CLASSIFIED_AS',
    participants: [
      { canonicalId: entityKey, role: 'entity', ordinal: 0 },
      { canonicalId: conceptKey0, role: 'concept', ordinal: 1 },
    ],
    evidenceRefs: [`evidence:${marker}`],
    workspaceRevision: `ws:${marker}`,
    graphRevision: `graph:${marker}`,
    sourceRevision: `src:${marker}`,
    producerRevision: marker,
  });
  const binaryKernel = hyperedgeToRelationshipKernel(binaryHyperedge);
  // buildRelationshipKernel's canonicalizeParticipants() sorts participants by
  // ROLE NAME alphabetically, then reassigns ordinal 0/1 — it does NOT preserve
  // the caller's original ordinal order. Confirmed live: this bit the first
  // version of this proof (hardcoded subjectKey->objectKey direction, got a
  // real "expected 1 binary edge read back, got 0" failure because the
  // projector — correctly — wrote the edge in the OTHER direction). The fix
  // is to never assume a direction; always derive it from the kernel's own
  // post-canonicalization participants, exactly as the projector itself does.
  const [binaryFrom, binaryTo] = [...binaryKernel.participants].sort((a, b) => a.ordinal - b.ordinal);

  const docKey = `doc:${marker}`;
  const conceptKey = `concept:${marker}:ternary-object`;
  const toolKey = `tool:${marker}:context`;
  const ternaryRelationship = buildFeatureRelationship({
    relationship_id: `rel:${marker}:ternary`,
    relationship_type: 'DOC_RELATES_CONCEPTS_VIA_TOOL',
    participants: [
      { role: 'subject', entity_type: 'document', entity_id: docKey },
      { role: 'object', entity_type: 'concept', entity_id: conceptKey },
      { role: 'context', entity_type: 'tool', entity_id: toolKey },
    ],
    source_ref: `docs/${marker}.md`,
    source_revision: `src:${marker}`,
    relationship_revision: `rel-r1:${marker}`,
    producer_revision: marker,
    evidence_refs: [`evidence:${marker}:ternary`],
  });
  report.ternaryDegreeKind = ternaryRelationship.relationship_degree_kind;
  assert(ternaryRelationship.relationship_degree_kind === 'ternary', 'fixture must actually be ternary to prove the hub-node path');
  const ternaryKernel = featureRelationshipToKernel(ternaryRelationship);

  const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword), {
    disableLosslessIntegers: true,
    connectionTimeout: 5000,
    maxTransactionRetryTime: 0,
  });
  const session = driver.session({ database: 'neo4j' });

  try {
    const projection = await projectRelationshipKernelsToNeo4j(session, [binaryKernel, ternaryKernel]);
    report.projection = projection;
    assert(projection.binaryEdgesWritten === 1, `expected 1 binary edge, got ${projection.binaryEdgesWritten}`);
    assert(projection.hubNodesWritten === 1, `expected 1 hub node, got ${projection.hubNodesWritten}`);
    assert(projection.incidentEdgesWritten === 3, `expected 3 incident edges, got ${projection.incidentEdgesWritten}`);
    assert(projection.skipped.length === 0, `expected 0 skipped, got ${JSON.stringify(projection.skipped)}`);

    const binaryReadBack = await session.run(
      `MATCH (fromNode {stableKey: $fromKey})-[r:ENTITY_CLASSIFIED_AS]->(toNode {stableKey: $toKey})
       RETURN r.relationshipId AS relationshipId, r.authority AS authority, r.checksum AS checksum`,
      { fromKey: binaryFrom!.canonicalId, toKey: binaryTo!.canonicalId },
    );
    assert(binaryReadBack.records.length === 1, `expected 1 binary edge read back, got ${binaryReadBack.records.length}`);
    const binaryRow = binaryReadBack.records[0]!.toObject();
    assert(binaryRow.relationshipId === binaryKernel.relationshipId, 'binary edge relationshipId mismatch');
    assert(binaryRow.authority === 'KAG_TAXONOMY', `binary edge authority mismatch: ${binaryRow.authority}`);
    assert(binaryRow.checksum === binaryKernel.checksum, 'binary edge checksum mismatch');
    report.binaryReadBack = binaryRow;

    const hubReadBack = await session.run(
      `MATCH (relation:AtlasRelation {relationshipId: $relationshipId})-[r:INCIDENT_TO]->(entity)
       RETURN entity.stableKey AS entityKey, r.role AS role, r.ordinal AS ordinal
       ORDER BY r.ordinal`,
      { relationshipId: ternaryKernel.relationshipId },
    );
    assert(hubReadBack.records.length === 3, `expected 3 incident edges read back, got ${hubReadBack.records.length}`);
    const hubRows = hubReadBack.records.map((record) => record.toObject());
    // Same canonicalization-order lesson as the binary case: derive expected
    // order from the kernel's own (already-canonicalized) participants,
    // never from the fixture's pre-canonicalization construction order.
    const expectedOrder = [...ternaryKernel.participants].sort((a, b) => a.ordinal - b.ordinal);
    assert(
      hubRows.every((row, index) => row.entityKey === expectedOrder[index]!.canonicalId && row.role === expectedOrder[index]!.role),
      `hub read-back order/role mismatch: got ${JSON.stringify(hubRows)}, expected order ${JSON.stringify(expectedOrder)}`,
    );
    assert(
      new Set(hubRows.map((row) => row.entityKey)).size === 3
        && [docKey, conceptKey, toolKey].every((key) => hubRows.some((row) => row.entityKey === key)),
      `expected exactly {${docKey}, ${conceptKey}, ${toolKey}} as a set, got ${JSON.stringify(hubRows.map((r) => r.entityKey))}`,
    );
    report.hubReadBack = hubRows;

    // Prove the injection guard actually fires, not just that it exists.
    const unsafeResult = await projectRelationshipKernelsToNeo4j(session, [
      { ...binaryKernel, relationType: 'not_a_safe_type; MATCH (n) DETACH DELETE n' },
    ]);
    assert(unsafeResult.skipped.length === 1, 'expected the unsafe relation type to be skipped, not executed');
    assert(unsafeResult.skipped[0]!.reason.startsWith('NEO4J_PROJECTOR_UNSAFE_RELATION_TYPE'), 'wrong skip reason');
    report.unsafeRelationTypeRejected = true;
  } finally {
    // DETACH DELETE everywhere, not plain DELETE: a bare DELETE on a node
    // that still has ANY relationship (from this run or a prior interrupted
    // one) throws Neo.ClientError.Schema.ConstraintValidationFailed —
    // confirmed live when an earlier run of this exact proof was interrupted
    // before its own cleanup ran, leaving residue a later run's narrower
    // "delete only the one edge I made" cleanup couldn't remove. Cleanup
    // must be unconditionally complete, not scoped to what this run assumes
    // it created.
    await session.run(`MATCH (n {stableKey: $key}) DETACH DELETE n`, { key: entityKey });
    await session.run(`MATCH (n {stableKey: $key}) DETACH DELETE n`, { key: conceptKey0 });
    await session.run(
      `MATCH (relation:AtlasRelation {relationshipId: $relationshipId}) DETACH DELETE relation`,
      { relationshipId: ternaryKernel.relationshipId },
    );
    for (const key of [docKey, conceptKey, toolKey]) {
      await session.run(`MATCH (n {stableKey: $key}) DETACH DELETE n`, { key });
    }

    const residueCheck = await session.run(
      `MATCH (n) WHERE n.stableKey IN $keys OR n.relationshipId = $relationshipId RETURN count(n) AS c`,
      { keys: [entityKey, conceptKey0, docKey, conceptKey, toolKey], relationshipId: ternaryKernel.relationshipId },
    );
    const residue = residueCheck.records[0]!.get('c');
    report.cleanupVerified = Number(residue) === 0;
    if (Number(residue) !== 0) report.cleanupResidue = Number(residue);

    await session.close();
    await driver.close();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.cleanupVerified) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
