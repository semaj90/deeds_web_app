import { createHash } from 'node:crypto';
import {
  candidateLatent256HydrationReceiptV1Schema,
  type CandidateLatent256HydrationReceiptV1,
} from '../atlas/features/candidate-latent256-hydration-receipt-v1.js';
import type { FeaturePresenceState } from '../ace/context-compiler.parent-atlas.js';
import {
  verifyRepairFeatureProducerSetV1,
  type RepairFeatureProducerSetV1,
} from './repair-feature-producer-v1.js';

export const REPAIR_FEATURE_PRESENCE_EVIDENCE_SCHEMA =
  'atlas.repair-feature-presence-evidence.v1' as const;

export interface RepairFeaturePresenceEvidenceV1 {
  schema: typeof REPAIR_FEATURE_PRESENCE_EVIDENCE_SCHEMA;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidateRowCount: number;
  /** Safe to spread over ACEContextManifestOptions.featurePresence. */
  featurePresence: Record<string, FeaturePresenceState>;
  evidence: {
    latent256HydrationReceiptChecksum: string | null;
    repairProducerSetChecksum: string | null;
  };
  presenceChecksum: string;
  canonicalAuthority: false;
  retrievalVote: false;
  rankingPromotion: false;
  mutationAuthority: false;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function normalizeChecksum(value: string): string {
  return value.toLowerCase().replace(/^sha256:/, '');
}

function checksumEqual(a: string, b: string): boolean {
  return normalizeChecksum(a) === normalizeChecksum(b);
}

function latent256Presence(receipt: CandidateLatent256HydrationReceiptV1): FeaturePresenceState {
  if (receipt.rowCount === 0 || receipt.availableCount === 0) return 'UNAVAILABLE';
  if (receipt.availableCount === receipt.rowCount) return 'PROVEN';
  return 'PARTIAL';
}

/**
 * Converts revision-qualified repair evidence into conservative ContextManifest-compatible
 * presence overrides. Representation availability and query-conditioned similarity are separate:
 * a latent_256 hydration receipt may prove `latent256`, but it never proves
 * `latent256QuerySimilarity` without a same-checkpoint query-projection producer.
 */
export function buildRepairFeaturePresenceEvidenceV1(input: {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  candidateRowCount: number;
  latent256HydrationReceipt?: CandidateLatent256HydrationReceiptV1 | null;
  repairProducerSet?: RepairFeatureProducerSetV1 | null;
}): RepairFeaturePresenceEvidenceV1 {
  if (!input.candidateSnapshotRevision.trim()) {
    throw new Error('REPAIR_PRESENCE_CANDIDATE_SNAPSHOT_REQUIRED');
  }
  if (!input.ordinalMapChecksum.trim()) {
    throw new Error('REPAIR_PRESENCE_ORDINAL_MAP_CHECKSUM_REQUIRED');
  }
  if (!Number.isInteger(input.candidateRowCount) || input.candidateRowCount <= 0) {
    throw new Error('REPAIR_PRESENCE_CANDIDATE_ROW_COUNT_INVALID');
  }

  const featurePresence: Record<string, FeaturePresenceState> = {
    latent256: 'UNAVAILABLE',
    latent128: 'UNAVAILABLE',
    latent64: 'UNAVAILABLE',
    latent256QuerySimilarity: 'UNAVAILABLE',
    latent128QuerySimilarity: 'UNAVAILABLE',
    latent64QuerySimilarity: 'UNAVAILABLE',
    semanticMrl512QuerySimilarity: 'UNAVAILABLE',
    semanticMrl256QuerySimilarity: 'UNAVAILABLE',
    semanticMrl128QuerySimilarity: 'UNAVAILABLE',
  };

  let latentReceiptChecksum: string | null = null;
  if (input.latent256HydrationReceipt) {
    const receipt = candidateLatent256HydrationReceiptV1Schema.parse(
      input.latent256HydrationReceipt,
    );
    if (receipt.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
      throw new Error('REPAIR_PRESENCE_LATENT256_CANDIDATE_SNAPSHOT_MISMATCH');
    }
    if (!checksumEqual(receipt.ordinalMapChecksum, input.ordinalMapChecksum)) {
      throw new Error('REPAIR_PRESENCE_LATENT256_ORDINAL_MAP_MISMATCH');
    }
    if (receipt.rowCount !== input.candidateRowCount) {
      throw new Error('REPAIR_PRESENCE_LATENT256_ROW_COUNT_MISMATCH');
    }
    featurePresence.latent256 = latent256Presence(receipt);
    latentReceiptChecksum = `sha256:${normalizeChecksum(receipt.receiptChecksum)}`;
  }

  let producerSetChecksum: string | null = null;
  if (input.repairProducerSet) {
    const set = input.repairProducerSet;

    // The producer set is rebuilt from its full immutable artifacts before any state reaches
    // ContextManifest. Summaries or overlay rows alone cannot assert availability.
    verifyRepairFeatureProducerSetV1(set);

    if (set.candidateSnapshotRevision !== input.candidateSnapshotRevision) {
      throw new Error('REPAIR_PRESENCE_PRODUCER_SET_CANDIDATE_SNAPSHOT_MISMATCH');
    }
    if (!checksumEqual(set.ordinalMapChecksum, input.ordinalMapChecksum)) {
      throw new Error('REPAIR_PRESENCE_PRODUCER_SET_ORDINAL_MAP_MISMATCH');
    }
    if (set.candidateRowCount !== input.candidateRowCount) {
      throw new Error('REPAIR_PRESENCE_PRODUCER_SET_ROW_COUNT_MISMATCH');
    }

    const state = set.overlayFeatureStates;
    featurePresence.semanticMrl512QuerySimilarity = state.semantic_mrl_512_query_similarity;
    featurePresence.semanticMrl256QuerySimilarity = state.semantic_mrl_256_query_similarity;
    featurePresence.semanticMrl128QuerySimilarity = state.semantic_mrl_128_query_similarity;
    featurePresence.latent256QuerySimilarity = state.latent_256_query_similarity;
    featurePresence.latent128QuerySimilarity = state.latent_128_query_similarity;
    featurePresence.latent64QuerySimilarity = state.latent_64_query_similarity;
    producerSetChecksum = set.producerSetChecksum;
  }

  const body = {
    schema: REPAIR_FEATURE_PRESENCE_EVIDENCE_SCHEMA,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    candidateRowCount: input.candidateRowCount,
    featurePresence,
    evidence: {
      latent256HydrationReceiptChecksum: latentReceiptChecksum,
      repairProducerSetChecksum: producerSetChecksum,
    },
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
    mutationAuthority: false as const,
  };

  return {
    ...body,
    presenceChecksum: sha256(body),
  };
}
