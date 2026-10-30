import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { embedSemantic768Canonical } from '$lib/server/embedding/canonical-embed.js';
import {
  bindProbeToModelReceiptV1,
  probeLlamaServerEmbeddingRuntimeV1,
  type EmbeddingModelReceiptV1,
} from '$lib/server/embedding/embedding-runtime-health-v1.js';
import {
  EVIDENCE_INPUT_RECIPE_REVISION,
  assertEvidenceEmbeddingAdmitted,
  evidenceInputSha256,
  type EvidenceEmbeddingProvenance,
} from './evidence-embedding-contract.js';

/**
 * Qualified producer for evidence chunk vectors. The only lane that can satisfy the evidence contract:
 * strict llama.cpp `/v1/embeddings` (embedSemantic768Canonical), bound to a proven, fresh EMB-PROV-01 receipt whose
 * artifact path equals the LIVE `/props` model_path. No Ollama, ONNX, cache or pseudo-vector fallback: every failure
 * throws so the caller records a vector-store failure instead of persisting an unqualified vector.
 */
export interface EvidenceEmbeddingProducerOptions {
  baseUrl: string;
  /** Parsed docs/reports/emb-prov-01-embedding-provenance-receipt.json (loaded by the caller). */
  receipt: EmbeddingModelReceiptV1 & { provenanceFields?: { serverModelAlias?: string; tokenizerRevision?: string; inputPolicyRevision?: string } };
  tokenizerRevision: string;
  inputPolicyRevision: string;
  now?: Date;
  maxReceiptAgeHours?: number;
  fetchImpl?: typeof fetch;
}

export interface ProducedEvidenceEmbedding {
  vector: number[];
  provenance: EvidenceEmbeddingProvenance;
  /** Model alias the server reported; stored in evidence_vectors.model alongside the artifact digest in metadata. */
  model: string;
  outputChecksum: string;
}

export async function produceEvidenceChunkEmbedding(
  text: string,
  options: EvidenceEmbeddingProducerOptions,
): Promise<ProducedEvidenceEmbedding> {
  const model = options.receipt.provenanceFields?.serverModelAlias ?? 'embeddinggemma';

  const probe = await probeLlamaServerEmbeddingRuntimeV1({
    baseUrl: options.baseUrl,
    ...(options.fetchImpl ? { fetchImpl: (url, init) => options.fetchImpl!(url, init) } : {}),
  });
  const binding = bindProbeToModelReceiptV1(probe, options.receipt, {
    now: options.now,
    maxAgeHours: options.maxReceiptAgeHours,
    requestedModelId: model,
  });
  if (!binding.artifactIdentityBound || !binding.dimensionBound || !binding.runtimeReady) {
    throw new Error(`EVIDENCE_EMBEDDING_RUNTIME_NOT_BOUND:${binding.reasons.join('; ') || 'unbound'}`);
  }

  const result = await embedSemantic768Canonical(text, {
    model,
    modelArtifactRevision: options.receipt.artifact.recordedModelArtifactRevision,
    tokenizerRevision: options.tokenizerRevision,
    inputPolicyRevision: options.inputPolicyRevision,
    baseUrl: options.baseUrl,
  });

  const provenance: EvidenceEmbeddingProvenance = {
    modelArtifactSha256: `sha256:${options.receipt.artifact.liveArtifactSha256.trim().toLowerCase().replace(/^sha256[:-]/, '')}`,
    modelReceipt: {
      provider: 'llama-server',
      artifactIdentityBound: binding.artifactIdentityBound,
      dimensionBound: binding.dimensionBound,
      runtimeReady: binding.runtimeReady,
    },
    inputRecipeRevision: EVIDENCE_INPUT_RECIPE_REVISION,
    inputSha256: evidenceInputSha256(text),
  };
  return { vector: result.embedding, provenance, model: result.model, outputChecksum: result.outputChecksum };
}

export type EvidenceEmbeddingReceipt = EvidenceEmbeddingProducerOptions['receipt'];

const RECEIPT_RELATIVE_PATH = 'docs/reports/emb-prov-01-embedding-provenance-receipt.json';

/**
 * Loads the EMB-PROV-01 receipt from the repo (walks up from cwd; EVIDENCE_EMBEDDING_RECEIPT_PATH overrides).
 * Throws when it is missing or unparsable; freshness and artifact binding are enforced per call by the producer.
 */
export function loadEvidenceEmbeddingReceipt(): EvidenceEmbeddingReceipt {
  const override = process.env.EVIDENCE_EMBEDDING_RECEIPT_PATH;
  const candidates: string[] = [];
  if (override) candidates.push(override);
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    candidates.push(join(dir, RECEIPT_RELATIVE_PATH));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('EVIDENCE_EMBEDDING_RECEIPT_MISSING');
  return JSON.parse(readFileSync(found, 'utf8')) as EvidenceEmbeddingReceipt;
}

/** Binds receipt, base URL and revisions once; each call still re-probes the live runtime. */
export function createEvidenceEmbeddingProducer(baseUrl: string, overrides: Partial<EvidenceEmbeddingProducerOptions> = {}) {
  let receipt: EvidenceEmbeddingReceipt | null = overrides.receipt ?? null;
  return (text: string) => {
    receipt ??= loadEvidenceEmbeddingReceipt();
    const fields = receipt.provenanceFields ?? {};
    return produceEvidenceChunkEmbedding(text, {
      baseUrl,
      receipt,
      tokenizerRevision: overrides.tokenizerRevision ?? fields.tokenizerRevision ?? '',
      inputPolicyRevision: overrides.inputPolicyRevision ?? fields.inputPolicyRevision ?? '',
      now: overrides.now,
      maxReceiptAgeHours: overrides.maxReceiptAgeHours,
      fetchImpl: overrides.fetchImpl,
    });
  };
}

export { assertEvidenceEmbeddingAdmitted };
