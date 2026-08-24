import { pool } from '$lib/server/db/client.js';
import type { OntologyLinkedTupleV1 } from './contracts/ontology-linked-tuple-v1.js';

/**
 * KAG-01/02 persistence (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
 *
 * `atlas_ontology_linked_tuples` (drizzle/manual/20260825_atlas_ontology_linked_tuples.sql)
 * is the durable truth layer for `OntologyLinkedTupleV1`. Before this file,
 * the only real producer (`taxonomy-topology-packet.ts::buildTaxonomyTopologyPacket`,
 * called from a registered MCP tool) wrote tuples ONLY to Redis
 * (`ontology-linked-tuple-cache.ts`, 6h TTL) — violating this repo's own
 * "Postgres is truth, write there first" rule. This function is meant to be
 * called BEFORE the existing Redis cache write, not instead of it.
 *
 * Pure upsert, no delete/archive semantics here — a tuple that stops being
 * produced simply stops being refreshed; nothing in this file prunes rows.
 */
export async function persistOntologyLinkedTuples(
  tuples: readonly OntologyLinkedTupleV1[],
  producerRevision: string
): Promise<{ attempted: number; written: number; errors: Array<{ tupleId: string; message: string }> }> {
  const result = { attempted: 0, written: 0, errors: [] as Array<{ tupleId: string; message: string }> };
  if (tuples.length === 0) return result;

  for (const tuple of tuples) {
    result.attempted += 1;
    try {
      await pool.query(
        `INSERT INTO atlas_ontology_linked_tuples (
           tuple_id, schema_version, packet_key, source_ref, tree_node_id, document_id, title_id,
           surface_text, token_index, part_of_speech, label, label_kind, label_source,
           ontology_ids, concept_ids, participants, evidence_refs, relation_revision,
           evidence_span, confidence, evidence_state, lifecycle, provenance, producer_revision, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
           $14::text[],$15::text[],$16::jsonb,$17::text[],$18,
           $19::jsonb,$20,$21,$22,$23::jsonb,$24,now()
         )
         ON CONFLICT (tuple_id) DO UPDATE SET
           packet_key = EXCLUDED.packet_key,
           source_ref = EXCLUDED.source_ref,
           tree_node_id = EXCLUDED.tree_node_id,
           document_id = EXCLUDED.document_id,
           title_id = EXCLUDED.title_id,
           surface_text = EXCLUDED.surface_text,
           token_index = EXCLUDED.token_index,
           part_of_speech = EXCLUDED.part_of_speech,
           label = EXCLUDED.label,
           label_kind = EXCLUDED.label_kind,
           label_source = EXCLUDED.label_source,
           ontology_ids = EXCLUDED.ontology_ids,
           concept_ids = EXCLUDED.concept_ids,
           participants = EXCLUDED.participants,
           evidence_refs = EXCLUDED.evidence_refs,
           relation_revision = EXCLUDED.relation_revision,
           evidence_span = EXCLUDED.evidence_span,
           confidence = EXCLUDED.confidence,
           evidence_state = EXCLUDED.evidence_state,
           lifecycle = EXCLUDED.lifecycle,
           provenance = EXCLUDED.provenance,
           producer_revision = EXCLUDED.producer_revision,
           updated_at = now()`,
        [
          tuple.tupleId,
          tuple.schemaVersion,
          tuple.packetKey ?? null,
          tuple.sourceRef,
          tuple.treeNodeId ?? null,
          tuple.documentId ?? null,
          tuple.titleId ?? null,
          tuple.surfaceText,
          tuple.tokenIndex ?? null,
          tuple.partOfSpeech ?? null,
          tuple.label,
          tuple.labelKind,
          tuple.labelSource,
          tuple.ontologyIds,
          tuple.conceptIds,
          JSON.stringify(tuple.participants ?? []),
          tuple.evidenceRefs ?? [],
          tuple.relationRevision ?? null,
          tuple.evidenceSpan ? JSON.stringify(tuple.evidenceSpan) : null,
          tuple.confidence,
          tuple.evidenceState,
          tuple.lifecycle,
          JSON.stringify(tuple.provenance),
          producerRevision,
        ]
      );
      result.written += 1;
    } catch (err) {
      result.errors.push({ tupleId: tuple.tupleId, message: (err as Error)?.message ?? String(err) });
    }
  }

  return result;
}
