import {
  EvidenceImageAnalysisReceiptSchemaV1,
  isSupportedImageEvidenceMime,
  type EvidenceImageAnalysisReceiptV1,
} from './evidence-image-analysis-contract-v1.js';
import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { getSeaweedFile } from '$lib/server/seaweed-client.js';
import { processDocument } from '$lib/server/document-processor.js';
import { createEvidenceEmbeddingProducer } from './evidence-embedding-producer.js';
import { persistEvidenceVectorForProjectionV1 } from './evidence-vector-persistence-v1.js';
import { indexEvidenceDocumentCanonicalV1 } from './evidence-document-indexer-v1.js';
import { analyzeEvidenceImageV1 } from './evidence-visual-analysis-v1.js';
import {
  EMBEDDINGGEMMA2_ONNX_REVISION_V1,
  embedEvidenceTextWithEmbeddingGemma2OnnxV1,
} from './embeddinggemma2-onnx-image-v1.js';
import { persistEvidenceMultimodalVectorV1 } from './evidence-multimodal-vector-persistence-v1.js';
import type { EvidenceDocumentIndexerDependenciesV1 } from './evidence-document-indexer-v1.js';
import { synthesizeEvidenceClaimsV1, type EvidenceSynthesisResultV1 } from './synthesis/evidence-synthesis-v1.js';

export type EvidenceTextEmbeddingLaneV1 = 'embeddinggemma2_onnx' | 'semantic_768_v1';

/**
 * Which model embeds evidence text chunks.
 * - `embeddinggemma2_onnx`: local CPU ONNX model, same 768-D space as evidence image vectors; rows go to
 *   evidence_multimodal_vectors (modality document_chunk). Needs no :8081 server, receipt or Ollama.
 * - `semantic_768_v1`: the strict llama-server lane (evidence_vectors). The two spaces are not comparable.
 * EVIDENCE_TEXT_EMBEDDING_LANE overrides; otherwise EmbeddingGemma 2 is used when its model directory is configured.
 */
export function resolveEvidenceTextEmbeddingLaneV1(
  env: { lane?: string | null; modelDir?: string | null } = {
    lane: process.env.EVIDENCE_TEXT_EMBEDDING_LANE,
    modelDir: ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR,
  },
): EvidenceTextEmbeddingLaneV1 {
  const requested = env.lane?.trim();
  if (requested === 'embeddinggemma2_onnx' || requested === 'semantic_768_v1') return requested;
  if (requested) throw new Error('EVIDENCE_TEXT_EMBEDDING_LANE_INVALID');
  return env.modelDir?.trim() ? 'embeddinggemma2_onnx' : 'semantic_768_v1';
}

/** Indexer dependencies that embed chunks with EmbeddingGemma 2 and persist them to the multimodal table. */
export function createEmbeddingGemma2TextIndexerDependenciesV1(options: {
  caseId: string | null;
  modelDir: string | null | undefined;
  embed?: typeof embedEvidenceTextWithEmbeddingGemma2OnnxV1;
  persist?: typeof persistEvidenceMultimodalVectorV1;
  database?: Parameters<typeof persistEvidenceMultimodalVectorV1>[0];
}): EvidenceDocumentIndexerDependenciesV1 {
  const embedText = options.embed ?? embedEvidenceTextWithEmbeddingGemma2OnnxV1;
  const persistVector = options.persist ?? persistEvidenceMultimodalVectorV1;
  const produced = new Map<string, Awaited<ReturnType<typeof embedEvidenceTextWithEmbeddingGemma2OnnxV1>>>();
  return {
    embed: async (text) => {
      if (!options.caseId) throw new Error('EVIDENCE_TEXT_CASE_ID_REQUIRED');
      if (!options.modelDir?.trim()) throw new Error('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
      const result = await embedText({ text, kind: 'document', modelDir: options.modelDir });
      produced.set(result.outputSha256, result);
      return {
        vector: result.embedding,
        model: result.model,
        outputChecksum: result.outputSha256,
        provenance: {
          modelArtifactSha256: result.modelArtifactSha256,
          modelReceipt: { provider: 'cpu', artifactIdentityBound: true, dimensionBound: true, runtimeReady: true },
          inputRecipeRevision: result.preprocessingRevision,
          inputSha256: result.inputSha256,
        },
      };
    },
    persist: async (persistInput) => {
      const result = produced.get(persistInput.outputChecksum);
      if (!result || !options.caseId) throw new Error('EVIDENCE_TEXT_EMBEDDING_NOT_PRODUCED_BY_THIS_RUN');
      produced.delete(persistInput.outputChecksum);
      const chunkMetadata = persistInput.metadata ?? {};
      return persistVector(options.database ?? (db as unknown as Parameters<typeof persistEvidenceMultimodalVectorV1>[0]), {
        evidenceId: persistInput.evidenceId,
        caseId: options.caseId,
        sourceRevision: persistInput.sourceRevision,
        analysisRevision: `atlas.evidence-document-chunk.v1:${EMBEDDINGGEMMA2_ONNX_REVISION_V1}:${result.preprocessingRevision}`,
        modality: 'document_chunk',
        sourceLocator: {
          kind: 'text_chunk',
          chunkIndex: persistInput.chunkIndex,
          startOffset: typeof chunkMetadata.startOffset === 'number' ? chunkMetadata.startOffset : null,
          endOffset: typeof chunkMetadata.endOffset === 'number' ? chunkMetadata.endOffset : null,
        },
        embedding: persistInput.embedding,
        model: result.model,
        modelArtifactSha256: result.modelArtifactSha256,
        preprocessingRevision: result.preprocessingRevision,
        inputSha256: result.inputSha256,
        outputSha256: result.outputSha256,
        metadata: { ...chunkMetadata, content: persistInput.content, tokenCountEmbedded: result.tokenCount },
      });
    },
  };
}

export async function processEvidenceDocumentCanonicalV1(input: {
  evidenceId: string;
  text: string;
  sourceBytes?: Buffer;
  fileName?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  visualAnalysis?: Awaited<ReturnType<typeof analyzeEvidenceImageV1>>;
}): Promise<{ chunkCount: number; persistedCount: number; sourceRevision: string; synthesis: EvidenceSynthesisResultV1 }> {
  let sourceBytes: Buffer | undefined = input.sourceBytes;
  let text = input.text;
  let extractionMethod = 'provided-extracted-text';
  let doclingBlocks: Array<Record<string, unknown>> | undefined;
  const metadata = input.metadata ?? {};
  const bucket = metadata.object_bucket;
  const objectName = metadata.object_name;

  if (!sourceBytes && (bucket !== undefined || objectName !== undefined)) {
    if (bucket !== ENV.SEAWEED_EVIDENCE_BUCKET || typeof objectName !== 'string' || !objectName.startsWith('evidence/')) {
      throw new Error('EVIDENCE_OBJECT_REFERENCE_INVALID');
    }
    sourceBytes = await getSeaweedFile(bucket, objectName);
    const extracted = await processDocument({
      buffer: sourceBytes,
      fileName: input.fileName ?? 'evidence-upload',
      mimeType: input.contentType ?? 'application/octet-stream',
      evidenceId: input.evidenceId,
      skipEmbedding: true,
    });
    text = extracted.rawText;
    extractionMethod = extracted.extractionMethod;
    doclingBlocks = extracted.doclingBlocks;
  }

  const computedSourceHash = sourceBytes
    ? createHash('sha256').update(sourceBytes).digest('hex')
    : createHash('sha256').update(text, 'utf8').digest('hex');
  const claimedSourceRevision = metadata.source_revision;
  if (sourceBytes && typeof claimedSourceRevision === 'string'
    && claimedSourceRevision !== `sha256:${computedSourceHash}`) {
    throw new Error('EVIDENCE_SOURCE_REVISION_READBACK_MISMATCH');
  }
  const sourceHash = sourceBytes
    ? computedSourceHash
    : typeof claimedSourceRevision === 'string' && /^sha256:[a-f0-9]{64}$/.test(claimedSourceRevision)
      ? claimedSourceRevision.slice('sha256:'.length)
      : computedSourceHash;
  const sourceRevision = `sha256:${sourceHash}`;
  const synthesis = await synthesizeEvidenceClaimsV1({
    evidenceId: input.evidenceId,
    sourceRevision,
    extractedText: text,
    caseId: typeof metadata.caseId === 'string' ? metadata.caseId : null,
    enabled: ENV.LANGEXTRACT_ENABLED,
  }, sourceBytes);
  const fileName = input.fileName ?? (typeof metadata.fileName === 'string' ? metadata.fileName : undefined) ?? null;
  const contentType = input.contentType ?? (typeof metadata.fileType === 'string' ? metadata.fileType : undefined) ?? '';
  const isImage = /^image\/(png|jpeg|tiff|bmp|webp)$/i.test(contentType)
    || /\.(png|jpe?g|tiff?|bmp|webp)$/i.test(fileName ?? '');
  let visualAnalysis: Awaited<ReturnType<typeof analyzeEvidenceImageV1>> | undefined;
  if (isImage && sourceBytes) {
    const normalizedMime = /^image\/(png|jpeg|tiff|bmp|webp)$/i.test(contentType)
      ? contentType.toLowerCase()
      : /\.png$/i.test(fileName ?? '') ? 'image/png'
        : /\.jpe?g$/i.test(fileName ?? '') ? 'image/jpeg'
          : /\.tiff?$/i.test(fileName ?? '') ? 'image/tiff'
            : /\.bmp$/i.test(fileName ?? '') ? 'image/bmp'
              : 'image/webp';
    const caseId = typeof metadata.caseId === 'string' ? metadata.caseId : undefined;
    if (input.visualAnalysis?.sourceRevision === sourceRevision) {
      visualAnalysis = input.visualAnalysis;
    } else {
      try {
        visualAnalysis = await analyzeEvidenceImageV1({
          evidenceId: input.evidenceId,
          caseId,
          fileName: fileName ?? 'evidence-image',
          contentType: normalizedMime,
          buffer: sourceBytes,
          sourceRevision,
        });
      } catch (error) {
        visualAnalysis = {
          schema: 'atlas.evidence-visual-analysis.v1',
          authority: 'OBSERVATION_ONLY',
          sourceRevision,
          status: 'UNAVAILABLE',
          objectDetections: [],
          layoutRegions: [],
          visionSummary: null,
          visionFindings: [],
          visionTags: [],
          depthMap: null,
          stageErrors: [error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)],
        };
      }
    }
  }
  const textLane = resolveEvidenceTextEmbeddingLaneV1();
  let dependencies: EvidenceDocumentIndexerDependenciesV1;
  if (textLane === 'embeddinggemma2_onnx') {
    dependencies = createEmbeddingGemma2TextIndexerDependenciesV1({
      caseId: typeof metadata.caseId === 'string' ? metadata.caseId : null,
      modelDir: ENV.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR,
    });
  } else {
    const embeddingBaseUrl = ENV.EMBEDDING_STRICT_BASE_URL;
    if (!embeddingBaseUrl) throw new Error('EVIDENCE_EMBEDDING_ENDPOINT_NOT_CONFIGURED');
    dependencies = {
      embed: createEvidenceEmbeddingProducer(embeddingBaseUrl),
      persist: (persistInput) => persistEvidenceVectorForProjectionV1(db, persistInput),
    };
  }

  const indexed = await indexEvidenceDocumentCanonicalV1({
    evidenceId: input.evidenceId,
    sourceRevision,
    text,
    doclingBlocks,
    metadata: {
      ...metadata,
      extractionMethod,
      fileName,
      source_bytes_sha256: sourceHash,
      visual_analysis: visualAnalysis ?? null,
      text_embedding_lane: textLane,
    },
    dependencies,
  });
  return { ...indexed, sourceRevision, synthesis };
}


export interface BoundedImageAnalysisDeps {
  runYoloDetections?: (bytes: Uint8Array, mimeType: string) => Promise<{
    status: 'EXECUTED' | 'MODEL_UNAVAILABLE_SKIPPED' | 'FAILED';
    detections: Array<{
      label: string;
      confidence: number;
      bboxNormalized: [number, number, number, number];
    }>;
  }>;
  runSam2Segmentation?: (
    bytes: Uint8Array,
    mimeType: string,
    boxes: Array<{ label: string; confidence: number; bboxNormalized: [number, number, number, number] }>
  ) => Promise<{
    status: 'EXECUTED' | 'MODEL_UNAVAILABLE_SKIPPED' | 'OFFLINE_SKIPPED' | 'FAILED';
    masks: Array<{
      artifactKind: 'sam2_alpha_silhouette';
      maskObjectKey: string;
      maskSha256: string;
      targetBoxIndex: number;
      label: string;
      iouScore: number;
      is3DReconstruction: false;
    }>;
  }>;
  runVlmAnalysis?: (bytes: Uint8Array, mimeType: string) => Promise<{
    status: 'EXECUTED' | 'OFFLINE_SKIPPED' | 'FAILED';
    proposal: {
      description: string;
      extractedSceneText: string;
      modelId: string;
      modelRevision: string;
    } | null;
  }>;
  runMonocularDepth?: (bytes: Uint8Array, mimeType: string) => Promise<{
    status: 'EXECUTED' | 'OFFLINE_SKIPPED' | 'FAILED';
    depthMap: {
      depthObjectKey: string;
      depthSha256: string;
      width: number;
      height: number;
      modelRevision: string;
    } | null;
  }>;
}

export async function executeBoundedImageAnalysisV1(
  input: {
    caseId: string;
    evidenceId: string;
    sourceRevision: string;
    sourceSha256: string;
    mimeType: string;
    imageBytes: Uint8Array;
  },
  deps: BoundedImageAnalysisDeps
): Promise<EvidenceImageAnalysisReceiptV1> {
  if (!isSupportedImageEvidenceMime(input.mimeType)) {
    throw new Error(`UNSUPPORTED_IMAGE_EVIDENCE_MIME: ${input.mimeType}`);
  }

  // 1. YOLO ONNX Subprocess (Gracefully degrades if model file is absent)
  const yoloRes = deps.runYoloDetections
    ? await deps.runYoloDetections(input.imageBytes, input.mimeType).catch(() => ({
        status: 'FAILED' as const,
        detections: [],
      }))
    : { status: 'MODEL_UNAVAILABLE_SKIPPED' as const, detections: [] };

  // 1b. SAM 2 Silhouette Segmentation (Uses YOLO boxes as prompt inputs)
  const sam2Res = deps.runSam2Segmentation
    ? await deps.runSam2Segmentation(input.imageBytes, input.mimeType, yoloRes.detections).catch(() => ({
        status: 'FAILED' as const,
        masks: [],
      }))
    : { status: 'MODEL_UNAVAILABLE_SKIPPED' as const, masks: [] };

  // 2. VLM Scene/OCR Proposal (Marked proposalOnly: true, canonicalAuthority: false)
  const vlmRes = deps.runVlmAnalysis
    ? await deps.runVlmAnalysis(input.imageBytes, input.mimeType).catch(() => ({
        status: 'FAILED' as const,
        proposal: null,
      }))
    : { status: 'OFFLINE_SKIPPED' as const, proposal: null };

  // 3. Monocular 2D Depth Map (Explicitly NOT a 3D reconstruction)
  const depthRes = deps.runMonocularDepth
    ? await deps.runMonocularDepth(input.imageBytes, input.mimeType).catch(() => ({
        status: 'FAILED' as const,
        depthMap: null,
      }))
    : { status: 'OFFLINE_SKIPPED' as const, depthMap: null };

  return EvidenceImageAnalysisReceiptSchemaV1.parse({
    schemaId: 'atlas.evidence-image-analysis.v1',
    caseId: input.caseId,
    evidenceId: input.evidenceId,
    sourceRevision: input.sourceRevision,
    sourceSha256: input.sourceSha256,
    mimeType: input.mimeType.trim().toLowerCase(),
    yoloStatus: yoloRes.status,
    yoloDetections: yoloRes.detections,
    sam2Status: sam2Res.status,
    sam2Masks: sam2Res.masks,
    vlmStatus: vlmRes.status,
    vlmProposal: vlmRes.proposal
      ? {
          ...vlmRes.proposal,
          proposalOnly: true,
          canonicalAuthority: false,
        }
      : null,
    depthStatus: depthRes.status,
    depthMap: depthRes.depthMap
      ? {
          ...depthRes.depthMap,
          artifactKind: 'monocular_depth_map_2d',
          is3DReconstruction: false,
        }
      : null,
    canonicalAuthority: false,
  });
}
