/**
 * Bitset / MsgPack / CouchDB MapReduce / Supersession Pass / Vision-VLM (YOLOX + Depth Anything V2 + SAM2)
 * & ACP/A2A Contextual Compiler Buffer Helper (v1)
 *
 * Unifies:
 * 1. BitEncoding / Bitshift / `AlignedBitsetBlobV1` (`ATLASBIT` 64B header + 64B-aligned `uint64` words)
 *    + `TensorHandleV1` (`THV1` 160B 4x4x6 INT4 nibble-packed spatial tile + Mode-7 2D affine projection).
 * 2. Integer-Tagged MessagePack (`PacketMsgpackTags` 0..29, `latent_64` FP16 128B + `manifold_4d` FP32 16B)
 *    & PostgreSQL 18 `BYTEA` (`\x...`) round-trip verification (`verifyPacketRoundTrip`).
 * 3. CouchDB MapReduce (`link_matrix` / `in_degree` / `out_degree` / `file_scores`) & Superseded Pass
 *    Consolidation (`DISTINCT ON (packet_key, source_revision, pass_type, pass_revision, input_hash)`
 *    ordered by `(created_at DESC, id DESC)` over `status IN ('success', 'succeeded')`).
 * 4. Screenshot / Evidence VLM Observation Compiler (YOLOX-Nano COCO 416 bounding boxes +
 *    Depth Anything V2 Small `relative_monocular` depth receipt + Apache-2.0 SAM 2 derivative silhouette masks
 *    + Gemma 4 legal `:8090` VLM findings) -> revision-bound ACP/A2A context packet.
 *
 * Invariants:
 * - Strictly read-only / proposal-only (`canonicalAuthority: false`, `writesPerformed: false`).
 * - Never persists `hiddenThoughts`, `chainOfThought`, `kv_cache`, or raw runtime tensors (`AGENTS.md`).
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  createAlignedBitsetBlob,
  fromPostgresBytea,
  jaccardSimilarity,
  popcount,
  toPostgresBytea,
} from './aligned-bitset-blob-v1.js';
import {
  decodeTensorHandle4x4x6V1,
  encodeTensorHandle4x4x6V1,
  projectMode7Affine2x3V1,
  SafeTileResidencyStateV1,
} from './tensor-handle-4x4x6-v1.js';
import { coerceToPacketEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';
import {
  decodeFP16,
  decodeFP32,
  decodePacketFromMsgpack,
  encodeFP16,
  encodeFP32,
  encodePacketToMsgpack,
  PacketMsgpackTags,
} from '../../serialization/packet-msgpack-codec.js';

export const SUPERSESSION_PASS_RECORD_SCHEMA_V1 = z
  .object({
    id: z.number().int().positive(),
    packetKey: z.string().min(1),
    sourceRevision: z.string().nullable(),
    passType: z.enum(['embedding', 'summarization', 'ast_cst', 'vlm_screenshot', 'domain_router']),
    passRevision: z.string().nullable(),
    inputHash: z.string().nullable(),
    status: z.enum(['success', 'succeeded', 'failed', 'superseded']),
    createdAtIso: z.string().min(1),
    outputSummary: z.string(),
  })
  .strict();

export type SupersessionPassRecordV1 = z.infer<typeof SUPERSESSION_PASS_RECORD_SCHEMA_V1>;

/**
 * Pure deterministic mirror of PostgreSQL `analysis_pass_current`:
 *   SELECT DISTINCT ON (packet_key, source_revision, pass_type, pass_revision, input_hash) ...
 *   WHERE status IN ('success', 'succeeded')
 *   ORDER BY ..., created_at DESC, id DESC
 *
 * Returns `currentPasses` (one latest winning pass per logical identity) and `supersededPassIds`.
 */
export function consolidateSupersededAnalysisPassesV1(
  records: readonly SupersessionPassRecordV1[],
): {
  currentPasses: SupersessionPassRecordV1[];
  supersededPassIds: number[];
  excludedFailedCount: number;
} {
  const validRecords = records.map((r) => SUPERSESSION_PASS_RECORD_SCHEMA_V1.parse(r));
  const groups = new Map<string, SupersessionPassRecordV1[]>();
  let excludedFailedCount = 0;

  for (const rec of validRecords) {
    if (rec.status !== 'success' && rec.status !== 'succeeded') {
      excludedFailedCount += 1;
      continue;
    }
    const groupKey = [
      rec.packetKey,
      rec.sourceRevision ?? '<null>',
      rec.passType,
      rec.passRevision ?? '<null>',
      rec.inputHash ?? '<null>',
    ].join('\x00');
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(rec);
    groups.set(groupKey, bucket);
  }

  const currentPasses: SupersessionPassRecordV1[] = [];
  const supersededPassIds: number[] = [];

  for (const [, bucket] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    bucket.sort((a, b) => {
      const tDiff = Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso);
      if (tDiff !== 0) return tDiff;
      return b.id - a.id;
    });
    currentPasses.push(bucket[0]);
    for (let i = 1; i < bucket.length; i++) {
      supersededPassIds.push(bucket[i].id);
    }
  }

  return {
    currentPasses,
    supersededPassIds: supersededPassIds.sort((a, b) => a - b),
    excludedFailedCount,
  };
}

export interface CouchDbLinkDocV1 {
  _id: string;
  type: 'codebase_file';
  imports: string[];
  supersedes?: string[];
}

/**
 * In-memory deterministic CouchDB MapReduce (`link_matrix`, `in_degree`, `out_degree`) +
 * Power-Iteration PageRank consolidation helper.
 */
export function runCouchDbMapReduceConsolidationV1(
  docs: readonly CouchDbLinkDocV1[],
  damping = 0.85,
  iterations = 40,
): {
  linkMatrixEdges: Array<{ from: string; to: string }>;
  inDegree: Record<string, number>;
  outDegree: Record<string, number>;
  pagerankScores: Record<string, number>;
  supersededDocIds: string[];
} {
  const linkMatrixEdges: Array<{ from: string; to: string }> = [];
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  const nodes = new Set<string>();
  const supersededSet = new Set<string>();

  for (const doc of docs) {
    if (doc.type !== 'codebase_file') continue;
    nodes.add(doc._id);
    const imports = Array.from(new Set(doc.imports ?? [])).filter((t) => t !== doc._id);
    outDegree[doc._id] = imports.length;
    for (const target of imports) {
      nodes.add(target);
      linkMatrixEdges.push({ from: doc._id, to: target });
      inDegree[target] = (inDegree[target] ?? 0) + 1;
    }
    for (const oldId of doc.supersedes ?? []) {
      supersededSet.add(oldId);
    }
  }

  const nodeList = [...nodes].sort();
  const n = nodeList.length;
  const pagerankScores: Record<string, number> = {};
  if (n === 0) {
    return {
      linkMatrixEdges,
      inDegree,
      outDegree,
      pagerankScores,
      supersededDocIds: [...supersededSet].sort(),
    };
  }

  for (const id of nodeList) {
    inDegree[id] = inDegree[id] ?? 0;
    outDegree[id] = outDegree[id] ?? 0;
    pagerankScores[id] = 1.0 / n;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const nextScores: Record<string, number> = {};
    let sinkMass = 0;
    for (const id of nodeList) {
      nextScores[id] = (1.0 - damping) / n;
      if ((outDegree[id] ?? 0) === 0) {
        sinkMass += pagerankScores[id];
      }
    }
    for (const edge of linkMatrixEdges) {
      const deg = outDegree[edge.from] || 1;
      nextScores[edge.to] += damping * (pagerankScores[edge.from] / deg);
    }
    const sinkShare = damping * (sinkMass / n);
    for (const id of nodeList) {
      pagerankScores[id] = nextScores[id] + sinkShare;
    }
  }

  for (const id of nodeList) {
    pagerankScores[id] = Number(pagerankScores[id].toFixed(6));
  }

  return {
    linkMatrixEdges,
    inDegree,
    outDegree,
    pagerankScores,
    supersededDocIds: [...supersededSet].sort(),
  };
}

export const SCREENSHOT_VLM_OBSERVATION_SCHEMA_V1 = z
  .object({
    evidenceId: z.string().uuid(),
    sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    yoloxDetections: z.array(
      z.object({
        className: z.string().min(1),
        confidence: z.number().min(0).max(1),
        bboxNormalized: z.tuple([
          z.number().min(0).max(1),
          z.number().min(0).max(1),
          z.number().min(0).max(1),
          z.number().min(0).max(1),
        ]),
      }),
    ),
    depthAnythingV2: z
      .object({
        modelRevision: z.string().min(1),
        depthSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        depthType: z.literal('relative_monocular'),
        device: z.enum(['cpu', 'cuda']),
      })
      .nullable(),
    sam2Silhouettes: z.array(
      z.object({
        maskSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        iouScore: z.number().min(0).max(1),
        device: z.enum(['cpu', 'cuda']),
      }),
    ),
    vlmSynthesisSummary: z.string().min(1),
  })
  .strict();

export type ScreenshotVlmObservationInputV1 = z.infer<typeof SCREENSHOT_VLM_OBSERVATION_SCHEMA_V1>;

/**
 * Compiles YOLOX-Nano + Depth Anything V2 + Apache SAM 2 + VLM observations,
 * `AlignedBitsetBlobV1` (`ATLASBIT`), `TensorHandleV1` (`THV1` 160B 4x4x6 + Mode-7 affine),
 * and integer-tagged MessagePack (`BYTEA` `\x...`) into a revision-bound ACP/A2A contextual packet.
 */
export function compileContextualAlignmentEnvelopeV1(input: {
  packetKey: string;
  sourceRef: string;
  candidateOrdinal: number;
  kmeansClusterId: number;
  somBmuId: number;
  activeDomainBitIndices: readonly number[];
  tileValues96: Float32Array | readonly number[];
  affine2x3: readonly [number, number, number, number, number, number];
  latent64: readonly number[];
  manifold4d: readonly [number, number, number, number];
  vlmObservation: ScreenshotVlmObservationInputV1;
  passHistory: readonly SupersessionPassRecordV1[];
  couchDocs: readonly CouchDbLinkDocV1[];
}) {
  const vlm = SCREENSHOT_VLM_OBSERVATION_SCHEMA_V1.parse(input.vlmObservation);

  // 1. AlignedBitsetBlobV1 ('ATLASBIT' 64B header + 64B padded uint64 words)
  const bitsetBlob = createAlignedBitsetBlob(512, input.activeDomainBitIndices);
  const bitsetBytes = toPostgresBytea(bitsetBlob);
  const bitsetRoundTrip = fromPostgresBytea(bitsetBytes, 'BYTEA_PAYLOAD');
  const bitsetJaccard = jaccardSimilarity(bitsetBlob, bitsetRoundTrip);
  const bitsetPopcount = popcount(bitsetRoundTrip);
  const bitsetByteaHex = `\\x${bitsetBytes.toString('hex')}`;

  // 2. TensorHandleV1 4x4x6 (160B 'THV1' INT4 nibble codec + Mode-7 affine transform + 7-state residency FSM)
  const wsPrefix64 = BigInt(`0x${vlm.workspaceRevision.slice(7, 23)}`);
  const srcPrefix64 = BigInt(`0x${vlm.sourceRevision.slice(7, 23)}`);
  const tensorHandleBuf = encodeTensorHandle4x4x6V1({
    values96: input.tileValues96,
    candidateOrdinal: input.candidateOrdinal,
    kmeansClusterId: input.kmeansClusterId,
    somBmuId: input.somBmuId,
    workspaceRevisionPrefix64: wsPrefix64,
    sourceRevisionPrefix64: srcPrefix64,
    affine2x3: input.affine2x3,
    residencyState: SafeTileResidencyStateV1.GPU_READY,
    activeConsumers: 1,
  });
  const tensorHandleDecoded = decodeTensorHandle4x4x6V1(tensorHandleBuf, wsPrefix64);
  const [mode7CenterX, mode7CenterY] = projectMode7Affine2x3V1(input.affine2x3, 2.0, 2.0);
  const tensorHandleByteaHex = `\\x${tensorHandleBuf.toString('hex')}`;

  // 3. MessagePack Integer-Tagged Codec (tags 0..29, FP16 latent_64 128B + FP32 manifold_4d 16B)
  if (input.latent64.length !== 64) {
    throw new Error('CONTEXTUAL_COMPILER_LATENT64_LENGTH_INVALID');
  }
  const fp16LatentBytes = encodeFP16([...input.latent64]);
  const fp16LatentDecoded = decodeFP16(fp16LatentBytes);
  const fp32ManifoldBytes = encodeFP32([...input.manifold4d]);
  const fp32ManifoldDecoded = decodeFP32(fp32ManifoldBytes);

  const canonicalPacketKeySha256 = input.packetKey.match(/^(?:sha256:)?[a-f0-9]{64}$/)
    ? input.packetKey
    : `sha256:${createHash('sha256').update(input.packetKey).digest('hex')}`;

  const msgpackBytes = encodePacketToMsgpack(coerceToPacketEnvelope({
    packet_key: canonicalPacketKeySha256,
    packet_id: vlm.evidenceId,
    title_id: input.packetKey,
    feature_id: 'vlm_screenshot_contextual_alignment',
    source_ref: input.sourceRef,
    directory_path: input.sourceRef.split('/').slice(0, -1).join('/'),
    som_row: Math.floor(input.somBmuId / 20),
    som_col: input.somBmuId % 20,
    som_cluster: `som_cluster_${input.somBmuId}`,
    community_id: input.kmeansClusterId,
    kmeans_cluster_id: input.kmeansClusterId,
    latent_64: [...input.latent64],
    manifold_4d: {
      x: input.manifold4d[0],
      y: input.manifold4d[1],
      z: input.manifold4d[2],
      t: input.manifold4d[3],
    },
    summary: vlm.vlmSynthesisSummary,
    used_concepts: vlm.yoloxDetections.map((d) => d.className),
    created_at: '2026-11-22T18:00:00Z',
    confidence: vlm.yoloxDetections[0]?.confidence ?? 0.9,
    extraction_method: 'yolox_nano+depth_anything_v2+sam2+gemma4_vlm',
  }));
  const msgpackDecoded = decodePacketFromMsgpack(msgpackBytes);
  const msgpackByteaHex = `\\x${Buffer.from(msgpackBytes).toString('hex')}`;

  // 4. Superseded Pass Consolidation & CouchDB MapReduce PageRank
  const supersession = consolidateSupersededAnalysisPassesV1(input.passHistory);
  const couchMapReduce = runCouchDbMapReduceConsolidationV1(input.couchDocs);

  const envelopePayload = {
    schema: 'atlas.contextual-alignment-compiler-envelope.v1' as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    persistsRawKvOrTensors: false as const,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: vlm.sourceRevision,
    workspaceRevision: vlm.workspaceRevision,
    bitsetAlignment: {
      magic: 'ATLASBIT',
      totalByteLength: bitsetBytes.byteLength,
      popcount: bitsetPopcount,
      roundTripJaccard: bitsetJaccard,
      pg18ByteaHexPrefix: bitsetByteaHex.slice(0, 34),
    },
    tensorHandle4x4x6Alignment: {
      magic: 'THV1',
      totalByteLength: tensorHandleBuf.byteLength,
      residencyState: SafeTileResidencyStateV1[tensorHandleDecoded.residencyState],
      mode7CenterWorld: [mode7CenterX, mode7CenterY] as [number, number],
      pg18ByteaHexPrefix: tensorHandleByteaHex.slice(0, 34),
    },
    msgpackAlignment: {
      encodedByteLength: msgpackBytes.byteLength,
      fp16LatentByteLength: fp16LatentBytes.byteLength,
      fp32ManifoldByteLength: fp32ManifoldBytes.byteLength,
      packetKeySurvived: msgpackDecoded.packet_key === canonicalPacketKeySha256,
      summarySurvived: msgpackDecoded.summary === vlm.vlmSynthesisSummary,
      latent64DimDecoded: fp16LatentDecoded.length,
      manifold4dDimDecoded: fp32ManifoldDecoded.length,
      pg18ByteaHexPrefix: msgpackByteaHex.slice(0, 34),
    },
    supersessionConsolidation: {
      currentPassCount: supersession.currentPasses.length,
      currentPassIds: supersession.currentPasses.map((p) => p.id),
      supersededPassIds: supersession.supersededPassIds,
      excludedFailedCount: supersession.excludedFailedCount,
    },
    couchDbMapReduce: {
      edgeCount: couchMapReduce.linkMatrixEdges.length,
      pagerankScores: couchMapReduce.pagerankScores,
      supersededDocIds: couchMapReduce.supersededDocIds,
    },
    screenshotVlmObservation: {
      authority: 'OBSERVATION_ONLY' as const,
      yoloxDetectionCount: vlm.yoloxDetections.length,
      depthAnythingStatus: vlm.depthAnythingV2 ? 'ESTIMATED' : 'NOT_RUN',
      sam2SilhouetteCount: vlm.sam2Silhouettes.length,
      vlmSynthesisSummary: vlm.vlmSynthesisSummary,
    },
  };

  const envelopeChecksum = `sha256:${createHash('sha256')
    .update(JSON.stringify(envelopePayload))
    .digest('hex')}`;

  return {
    ...envelopePayload,
    envelopeChecksum,
  };
}
