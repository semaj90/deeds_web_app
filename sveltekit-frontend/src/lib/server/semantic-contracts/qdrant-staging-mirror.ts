/**
 * Qdrant Staging Mirror
 *
 * Syncs domain predictions and ontology proposals to Qdrant collections
 * for search-addressable filtering and retrieval.
 *
 * Collections:
 *   - domain_predictions_{runId}: Predicted domain classes (non-canonical staging)
 *   - ontology_proposals: Evidence-backed relation proposals
 *
 * These are STAGING ONLY — canonical updates occur only via authorized promotion gates.
 */

import { Qdrant } from '@qdrant/js-client';
import type {
  DomainPrediction,
  OntologyProposal,
} from '@atlas/semantic-contracts';

export interface StagingPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * Mirror domain prediction to Qdrant staging collection
 *
 * Collection: domain_predictions_{classificationRunId}
 * Point payload includes: packet_key, predicted_domain, calibrated_confidence, status
 */
export async function mirrorPredictionToQdrant(
  qdrant: Qdrant,
  prediction: DomainPrediction,
  embeddingVector: number[] // 768-dim from embeddinggemma
): Promise<void> {
  const p = prediction as any;
  const collectionName = `domain_predictions_${prediction.classificationRunId}`;

  // Ensure collection exists (768-dim vectors, cosine similarity)
  try {
    await qdrant.getCollection(collectionName);
  } catch {
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });
  }

  // Upsert point
  await qdrant.upsert(collectionName, {
    points: [
      {
        id: hashStringToNumber(prediction.prediction_id),
        vector: embeddingVector,
        payload: {
          prediction_id: p.prediction_id,
          packet_key: p.packet_key,
          predicted_domain: p.predicted_domain,
          raw_score: p.raw_score,
          score_margin: p.score_margin,
          calibrated_confidence: p.calibrated_confidence,
          status: p.status,
          gate_reason: p.gate_reason,
          created_at: p.created_at,
          classifier_kind: p.classifier_kind,
          classifier_version: p.classifier_version,
        },
      },
    ],
  });
}

/**
 * Mirror ontology proposal to Qdrant staging collection
 *
 * Collection: ontology_proposals
 * Point payload includes: subject_key, predicate, object_key, confidence, status
 */
export async function mirrorProposalToQdrant(
  qdrant: Qdrant,
  proposal: OntologyProposal,
  embeddingVector: number[] // 768-dim, semantic embedding of proposal content
): Promise<void> {
  const p = proposal as any;
  const collectionName = 'ontology_proposals';

  // Ensure collection exists
  try {
    await qdrant.getCollection(collectionName);
  } catch {
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });
  }

  // Upsert point
  await qdrant.upsert(collectionName, {
    points: [
      {
        id: hashStringToNumber(p.proposal_id),
        vector: embeddingVector,
        payload: {
          proposal_id: p.proposal_id,
          subject_packet_key: p.subject_packet_key,
          predicate: p.predicate,
          object_packet_key: p.object_packet_key,
          confidence: p.confidence,
          evidence_ids: p.evidence_ids,
          proposal_source: p.proposal_source,
          status: p.status,
          gate_reason: p.gate_reason,
          created_at: p.created_at,
        },
      },
    ],
  });
}

/**
 * Search staging predictions by similarity
 *
 * Returns top-k predictions by vector similarity to query embedding
 */
export async function searchStagingPredictions(
  qdrant: Qdrant,
  classificationRunId: string,
  queryEmbedding: number[],
  limit = 10,
  confidence_threshold = 0.5
): Promise<DomainPrediction[]> {
  const collectionName = `domain_predictions_${classificationRunId}`;

  try {
    const results = await qdrant.search(collectionName, {
      vector: queryEmbedding,
      limit,
      query_filter: {
        must: [
          {
            key: 'calibrated_confidence',
            range: {
              gte: confidence_threshold,
            },
          },
        ],
      },
      with_payload: true,
    });

    return results.map((r) => ({
      prediction_id: r.payload?.prediction_id as string,
      classificationRunId,
      packet_key: r.payload?.packet_key as string,
      predicted_domain: r.payload?.predicted_domain as string,
      raw_score: r.payload?.raw_score as number,
      score_margin: r.payload?.score_margin as number,
      calibrated_confidence: r.payload?.calibrated_confidence as number,
      classifier_kind: r.payload?.classifier_kind as string,
      classifier_version: r.payload?.classifier_version as string,
      model_sha256: '', // not stored in staging mirror
      feature_schema_version: '', // not stored
      source_snapshot_sha256: '', // not stored
      status: r.payload?.status as string,
      gate_reason: r.payload?.gate_reason as string | undefined,
      created_at: r.payload?.created_at as string,
      authorized_by: undefined,
      authorized_at: undefined,
      promoted_to_canonical_at: undefined,
    } as unknown as DomainPrediction));
  } catch {
    // Collection does not exist or no results
    return [];
  }
}

/**
 * Search staging proposals by similarity
 *
 * Returns top-k proposals by vector similarity to query embedding
 */
export async function searchStagingProposals(
  qdrant: Qdrant,
  queryEmbedding: number[],
  limit = 10,
  confidence_threshold = 0.5
): Promise<OntologyProposal[]> {
  const collectionName = 'ontology_proposals';

  try {
    const results = await qdrant.search(collectionName, {
      vector: queryEmbedding,
      limit,
      query_filter: {
        must: [
          {
            key: 'confidence',
            range: {
              gte: confidence_threshold,
            },
          },
        ],
      },
      with_payload: true,
    });

    return results.map((r) => ({
      proposal_id: r.payload?.proposal_id as string,
      subject_packet_key: r.payload?.subject_packet_key as string,
      predicate: r.payload?.predicate as string,
      object_packet_key: r.payload?.object_packet_key as string,
      confidence: r.payload?.confidence as number,
      evidence_ids: r.payload?.evidence_ids as string[],
      proposal_source: r.payload?.proposal_source as string,
      proposed_by: '', // not stored
      ontology_version: '', // not stored
      status: r.payload?.status as string,
      gate_reason: r.payload?.gate_reason as string | undefined,
      approved_by: undefined,
      approved_at: undefined,
      created_at: r.payload?.created_at as string,
    } as unknown as OntologyProposal));
  } catch {
    // Collection does not exist or no results
    return [];
  }
}

/**
 * Hash UUID string to 64-bit integer for Qdrant point ID
 *
 * Note: Qdrant requires 64-bit integer IDs; this is a lossy conversion.
 * UUID collision risk is negligible for operational use.
 */
function hashStringToNumber(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive 64-bit (approximate)
  return Math.abs(hash) * 65536 + (hash >>> 16);
}
