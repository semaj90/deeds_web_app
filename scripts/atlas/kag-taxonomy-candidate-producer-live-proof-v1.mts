import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

process.env.DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

const { OntologyLinkedTupleV1Schema } = await import('../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts');
const { persistOntologyLinkedTuples } = await import('../../sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts');
const { deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/taxonomy-candidate-producer-v1.ts');
const { persistTaxonomyAssignmentCandidates, listPendingTaxonomyAssignmentCandidates } = await import('../../sveltekit-frontend/src/lib/server/atlas/kag-taxonomy-candidate-postgres.ts');

/**
 * Live proof of the full producer chain (roadmap step 1), end to end against
 * real Postgres: a real OntologyLinkedTupleV1 is persisted (the same table
 * the live taxonomy-topology-packet.ts pipeline writes to), the producer
 * derives a candidate from it, the candidate is persisted, and it shows up
 * in the real pending-review queue. Real commits; explicit cleanup verified.
 */

const { Pool } = pg;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function main() {
  const report: Record<string, unknown> = { schema: 'atlas.kag.taxonomy-candidate-producer-live-proof.v1' };

  const tuple = OntologyLinkedTupleV1Schema.parse({
    tupleId: 'tuple:producer-live-proof-1',
    schemaVersion: 'ontology-linked-tuple.v1',
    // No packetKey: it has a real FK to atlas_packets, and this proof isn't
    // seeding a fake packet row. entityIdFor() falls back to sourceRef,
    // which is still a genuine, valid entity identity for the candidate.
    sourceRef: 'taxonomy:producer-live-proof',
    surfaceText: 'authentication',
    label: 'authentication',
    labelKind: 'ontology',
    labelSource: 'semantic_tagger',
    ontologyIds: ['ontology:producer-live-proof-auth'],
    conceptIds: ['concept:producer-live-proof-auth'],
    participants: [],
    evidenceRefs: ['src/lib/server/auth.ts#producer-live-proof'],
    confidence: 0.93,
    evidenceState: 'ACTIVE_VERIFIED',
    lifecycle: 'OBSERVED',
    provenance: { sourceTables: ['taxonomy_nodes'], labelerVersion: null, taggerVersion: null, ontologyVersion: 'ontology:producer-live-proof', nlpVersion: null },
  });

  const tuplePersist = await persistOntologyLinkedTuples([tuple], 'producer-live-proof:v1');
  assert(tuplePersist.written === 1, `expected tuple persisted, got ${JSON.stringify(tuplePersist)}`);
  report.tuplePersist = tuplePersist;

  const derived = deriveTaxonomyAssignmentCandidatesFromOntologyTuplesV1([tuple], 'producer-live-proof:v1');
  assert(derived.length === 1, `expected exactly 1 derived candidate, got ${derived.length}`);
  assert(derived[0].status === 'proposed', `expected auto-propose (confidence 0.93 >= threshold), got status=${derived[0].status}`);
  report.derived = derived;

  const candidatePersist = await persistTaxonomyAssignmentCandidates(derived);
  assert(candidatePersist.written === 1, `expected candidate persisted, got ${JSON.stringify(candidatePersist)}`);
  report.candidatePersist = candidatePersist;

  const pending = await listPendingTaxonomyAssignmentCandidates(500);
  const found = pending.find((c) => c.candidateId === derived[0].candidateId);
  assert(found, 'derived candidate should appear in the real pending queue');
  assert(found.entityId === 'taxonomy:producer-live-proof' && found.conceptId === 'concept:producer-live-proof-auth', 'pending candidate should carry the real entity/concept ids');
  report.foundInPendingQueue = found;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const deletedCandidate = await pool.query('DELETE FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = $1 RETURNING candidate_id', [derived[0].candidateId]);
    assert(deletedCandidate.rows.length === 1, 'cleanup should delete the candidate row');
    const deletedTuple = await pool.query('DELETE FROM atlas_ontology_linked_tuples WHERE tuple_id = $1 RETURNING tuple_id', [tuple.tupleId]);
    assert(deletedTuple.rows.length === 1, 'cleanup should delete the tuple row');

    const verifyGone = await pool.query(
      `SELECT
         (SELECT count(*) FROM atlas_taxonomy_assignment_candidates WHERE candidate_id = $1) AS candidate_left,
         (SELECT count(*) FROM atlas_ontology_linked_tuples WHERE tuple_id = $2) AS tuple_left`,
      [derived[0].candidateId, tuple.tupleId]
    );
    assert(Number(verifyGone.rows[0].candidate_left) === 0 && Number(verifyGone.rows[0].tuple_left) === 0, 'rows survived cleanup');

    report.status = 'PROVEN';
    report.cleanup = 'VERIFIED_REMOVED';
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(report, null, 2));
}

await main();
