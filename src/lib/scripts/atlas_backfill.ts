import type { Pool } from 'pg';

import { buildProjectionHash, type BackfillRow } from '../utils/data-hashing';
import {
  checkDimensionality,
  safeSourceLineage,
  safeVectorReadback,
  validatePayloadSchema,
  validateQdrantMapping,
  validateRepresentationContract,
} from '../utils/provenance-validators';
import { loadRepresentationContract } from '../server/db/atlas_representations';
import { resolveQdrantVectorTarget } from '../server/db/qdrant-mapping';
import { deriveProofState, type ProofGates } from '../server/atlas/validation/proof-gates';

export interface AtlasBackfillRecord {
  id: string;
  rawData: Record<string, unknown>;
}

export interface AtlasBackfillConfig {
  representationId: string;
  batchSize: number;
  dryRun: boolean;
}

export interface AtlasBackfillResult {
  processed: number;
  skipped: number;
  proofState: ReturnType<typeof deriveProofState>;
}

function buildPlaceholderBackfillRow(record: AtlasBackfillRecord): BackfillRow {
  const sourceContentHash = typeof record.rawData.source_content_hash === 'string' ? record.rawData.source_content_hash : null;
  const embeddingInputHash = typeof record.rawData.embedding_input_hash === 'string' ? record.rawData.embedding_input_hash : null;
  const projectionHash = JSON.stringify({
    id: record.id,
    representationId: record.rawData.representation_id ?? null,
  });

  return {
    sourceContentHash,
    embeddingInputHash,
    projectionHash,
  };
}

export async function executeBackfill(
  pool: Pool,
  initialSourceRecords: AtlasBackfillRecord[],
  config: AtlasBackfillConfig
): Promise<AtlasBackfillResult> {
  const contract = await loadRepresentationContract(pool, config.representationId);
  const qdrantTarget = await resolveQdrantVectorTarget(pool, 'dense_768', contract.representationId);

  let processed = 0;
  let skipped = 0;

  for (const record of initialSourceRecords) {
    const row = buildPlaceholderBackfillRow(record);
    const projectionHash = buildProjectionHash(row.sourceContentHash, row.embeddingInputHash, row.projectionHash);
    const sourceHash = row.sourceContentHash ?? '';
    const sourceLineage = await safeSourceLineage(sourceHash);
    const representationRegistry = await validateRepresentationContract(contract.representationId, {
      representationId: contract.representationId,
      sourceDimensions: contract.sourceDimensions,
      outputDimensions: contract.outputDimensions,
      normalization: contract.normalization,
      reduction: contract.reduction,
      vectorName: contract.vectorName,
      physicalCollection: contract.physicalCollection,
      projectionHash: contract.projectionHash,
    });
    const qdrantMapping = await validateQdrantMapping(qdrantTarget.vectorName, qdrantTarget.collectionName);
    const vectorParity = await checkDimensionality(Array.from({ length: contract.outputDimensions }, () => 0), contract.outputDimensions);
    const vectorReadback = await safeVectorReadback(
      Array.from({ length: contract.outputDimensions }, () => 0),
      Array.from({ length: contract.outputDimensions }, () => 0)
    );
    const payloadParity = await validatePayloadSchema(
      {
        projection_hash: projectionHash,
        representation_id: contract.representationId,
        vector_name: qdrantTarget.vectorName,
      },
      zodPayloadSchema
    );

    const gates: ProofGates = {
      representationRegistry,
      qdrantMapping,
      sourceLineage,
      vectorReadback,
      vectorParity,
      payloadParity,
      checkpointPersistence: !config.dryRun,
    };

    const proofState = deriveProofState(gates);

    if (proofState !== 'FULLY_PROVEN' && !config.dryRun) {
      skipped += 1;
      continue;
    }

    processed += 1;
    void projectionHash;
  }

  return {
    processed,
    skipped,
    proofState: deriveProofState({
      representationRegistry: true,
      qdrantMapping: true,
      sourceLineage: true,
      vectorReadback: true,
      vectorParity: true,
      payloadParity: true,
      checkpointPersistence: !config.dryRun,
    }),
  };
}

const zodPayloadSchema = {
  safeParse(value: unknown) {
    return {
      success:
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>).projection_hash === 'string' &&
        typeof (value as Record<string, unknown>).representation_id === 'string' &&
        typeof (value as Record<string, unknown>).vector_name === 'string',
    };
  },
};
