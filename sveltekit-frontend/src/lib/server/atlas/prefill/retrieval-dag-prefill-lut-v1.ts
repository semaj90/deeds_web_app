/**
 * retrieval-dag-prefill-lut-v1.ts
 *
 * NES-Style Decoupled Resource Lookup Table (LUT) for Retrieval DAG Prefill Synthesis.
 *
 * Connects:
 *  1. Direct OS byte-offset file reads (`openSync` / `readSync`) over `.f32bin` tensor shards
 *     (`byteOffset = ordinal * 3072`, `byteLength = 3072`) and UTF-8 source spans (`startByte..endByte`).
 *  2. Topological DAG dependency ordering (`dependencies -> dependents`) so foundational modules
 *     precede downstream callers in the synthesized prompt prefix, maximizing `llama-server`
 *     in-VRAM KV prefix-cache reuse (`cachedPrefillTokens`).
 *  3. Canonical prefill contracts (`OrdinalRegistryV1`, `PromptPlanV1`, `ContextPrefixIdentityV1`)
 *     while strictly enforcing the Parent Atlas guardrail: `kv_cache`, `hiddenThoughts`, and raw
 *     tensors are NEVER persisted to any database or cache store.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import { canonicalEncodeV1, sha256HexSchema } from './canonical-hash-v1.js';
import {
  buildContextPrefixIdentityV1,
  buildContextPrefixReuseObservationV1,
  type ContextPrefixIdentityV1,
  type ContextPrefixReuseObservationV1,
} from './context-prefix-identity-v1.js';
import {
  buildOrdinalRegistryV1,
  type OrdinalRegistryV1,
} from './ordinal-registry-v1.js';
import {
  buildPromptPlanV1,
  type PromptPlanSegmentV1,
  type PromptPlanV1,
} from './prompt-plan-v1.js';

export const RETRIEVAL_DAG_PREFILL_LUT_SCHEMA = 'atlas.retrieval-dag-prefill-lut.v1' as const;
export const SEMANTIC_768_VECTOR_BYTES = 3072 as const; // 768 * sizeof(float32)

export const RetrievalDagPrefillLutEntryV1Schema = z
  .object({
    ordinal: z.number().int().nonnegative(),
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    treeNodeId: z.string().regex(/^tn_v1_[0-9a-f]{32}$/),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    stratum: z.string().min(1),
    /** Direct byte offset into `.f32bin` (`ordinal * 3072`) */
    byteOffset: z.number().int().nonnegative(),
    /** Exact byte length in `.f32bin` (`3072` bytes for 768 x float32) */
    byteLength: z.literal(SEMANTIC_768_VECTOR_BYTES),
    /** SHA-256 hex (64 chars) of the 3,072-byte float32 vector slice */
    vectorSha256: sha256HexSchema,
    /** Exact UTF-8 byte range inside `sourceRef` for bounded OS `readSync` */
    sourceStartByte: z.number().int().nonnegative(),
    sourceEndByte: z.number().int().nonnegative(),
    /** Outgoing DAG dependencies (ordinals in the same LUT that this node imports/depends on) */
    dependencyOrdinals: z.array(z.number().int().nonnegative()),
    /** Incoming DAG dependents (ordinals in the same LUT that depend on this node) */
    dependentOrdinals: z.array(z.number().int().nonnegative()),
    representationRevision: z.string().min(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.sourceEndByte < val.sourceStartByte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceEndByte'],
        message: 'sourceEndByte must be >= sourceStartByte',
      });
    }
    if (val.byteOffset !== val.ordinal * SEMANTIC_768_VECTOR_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byteOffset'],
        message: `Expected contiguous byteOffset ${val.ordinal * SEMANTIC_768_VECTOR_BYTES} for ordinal ${val.ordinal}`,
      });
    }
  });

export type RetrievalDagPrefillLutEntryV1 = z.infer<
  typeof RetrievalDagPrefillLutEntryV1Schema
>;

export const RetrievalDagPrefillLutV1Schema = z
  .object({
    schema: z.literal(RETRIEVAL_DAG_PREFILL_LUT_SCHEMA),
    lutRevision: z.string().min(1),
    workspaceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    graphRevision: z.string().min(1),
    representationRevision: z.string().min(1),
    f32BinRelativePath: z.string().min(1),
    f32BinTotalBytes: z.number().int().nonnegative(),
    f32BinSha256: sha256HexSchema,
    entries: z.array(RetrievalDagPrefillLutEntryV1Schema).min(1),
    checksumSha256: sha256HexSchema,
  })
  .strict();

export type RetrievalDagPrefillLutV1 = z.infer<typeof RetrievalDagPrefillLutV1Schema>;

/**
 * Builds and validates a `RetrievalDagPrefillLutV1` registry and its companion `OrdinalRegistryV1`.
 */
export function buildRetrievalDagPrefillLutV1(input: {
  lutRevision: string;
  workspaceRevision: string;
  graphRevision: string;
  representationRevision: string;
  f32BinRelativePath: string;
  f32BinTotalBytes: number;
  f32BinSha256: string;
  entries: readonly RetrievalDagPrefillLutEntryV1[];
}): { lut: RetrievalDagPrefillLutV1; ordinalRegistry: OrdinalRegistryV1 } {
  const entries = [...input.entries]
    .map((e) => RetrievalDagPrefillLutEntryV1Schema.parse(e))
    .sort((a, b) => a.ordinal - b.ordinal);

  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.ordinal !== i) {
      throw new Error(`LUT ordinal gap at index ${i}: got ${entries[i]!.ordinal}`);
    }
  }

  if (input.f32BinTotalBytes !== entries.length * SEMANTIC_768_VECTOR_BYTES) {
    throw new Error(
      `f32BinTotalBytes (${input.f32BinTotalBytes}) does not match entries.length * 3072 (${entries.length * SEMANTIC_768_VECTOR_BYTES})`
    );
  }

  const payload = {
    schema: RETRIEVAL_DAG_PREFILL_LUT_SCHEMA,
    lutRevision: input.lutRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    f32BinRelativePath: input.f32BinRelativePath,
    f32BinTotalBytes: input.f32BinTotalBytes,
    f32BinSha256: input.f32BinSha256,
    entries,
  };

  const checksumSha256 = createHash('sha256')
    .update(canonicalEncodeV1(payload), 'utf8')
    .digest('hex');

  const lut = RetrievalDagPrefillLutV1Schema.parse({
    ...payload,
    checksumSha256,
  });

  const sourceRevisionSetHash = createHash('sha256')
    .update(
      canonicalEncodeV1(entries.map((e) => [e.sourceRef, e.sourceRevision])),
      'utf8'
    )
    .digest('hex');

  const ordinalRegistry = buildOrdinalRegistryV1({
    registryRevision: input.lutRevision,
    workspaceRevision: input.workspaceRevision,
    sourceRevisionSetHash,
    graphRevision: input.graphRevision,
    representationRevision: input.representationRevision,
    entries: entries.map((e) => ({
      canonicalId: e.canonicalId,
      packetKey: e.packetKey,
      symbolVersionId: null,
      treeNodeId: e.treeNodeId,
      semanticOrdinal: e.ordinal,
      graphOrdinal: e.ordinal,
      tensorRow: e.ordinal,
    })),
  });

  return { lut, ordinalRegistry };
}

/**
 * Direct OS byte-offset reader (`openSync` / `readSync`) for a 768-D float32 slice in `.f32bin`.
 * Verifies the slice SHA-256 against `entry.vectorSha256` before returning the `Float32Array`.
 */
export function readVectorSliceFromF32Bin(
  f32BinAbsPath: string,
  entry: RetrievalDagPrefillLutEntryV1
): Float32Array {
  const fd = fs.openSync(f32BinAbsPath, 'r');
  try {
    const rawBuf = Buffer.allocUnsafe(entry.byteLength);
    const bytesRead = fs.readSync(fd, rawBuf, 0, entry.byteLength, entry.byteOffset);
    if (bytesRead !== entry.byteLength) {
      throw new Error(
        `Short read at ordinal ${entry.ordinal} (offset ${entry.byteOffset}): expected ${entry.byteLength}, got ${bytesRead}`
      );
    }
    const actualSha = createHash('sha256').update(rawBuf).digest('hex');
    if (actualSha !== entry.vectorSha256) {
      throw new Error(
        `Vector slice SHA-256 mismatch at ordinal ${entry.ordinal}: expected ${entry.vectorSha256}, got ${actualSha}`
      );
    }
    return new Float32Array(
      rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength)
    );
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Direct OS byte-offset reader (`openSync` / `readSync`) for a bounded UTF-8 source slice.
 * Verifies the whole-file `sourceRevision` (`sha256:<64hex>`) fail-closed before slicing.
 */
export function readUtf8SourceSpanSlice(
  repoRoot: string,
  entry: RetrievalDagPrefillLutEntryV1,
  maxBytes = 2048
): { text: string; contentChecksum: string; bytesRead: number } {
  const absPath = `${repoRoot.replace(/\\/g, '/')}/${entry.sourceRef.replace(/^\/+/, '')}`;
  const fullBuf = fs.readFileSync(absPath);
  const actualRev = `sha256:${createHash('sha256').update(fullBuf).digest('hex')}`;
  if (actualRev !== entry.sourceRevision) {
    throw new Error(
      `STALE_SOURCE_REVISION for ${entry.sourceRef}: LUT expected ${entry.sourceRevision}, disk has ${actualRev}`
    );
  }

  const start = Math.max(0, Math.min(entry.sourceStartByte, fullBuf.byteLength));
  const end = Math.max(
    start,
    Math.min(entry.sourceEndByte, start + maxBytes, fullBuf.byteLength)
  );
  const sliceBuf = fullBuf.subarray(start, end);
  const text = sliceBuf.toString('utf8');
  const contentChecksum = createHash('sha256').update(sliceBuf).digest('hex');

  return {
    text,
    contentChecksum,
    bytesRead: sliceBuf.byteLength,
  };
}

/**
 * Orders a selected subset of LUT entries topologically (`dependency -> dependent`) using Kahn's
 * algorithm with deterministic tie-breaking by `ordinal`. Cycles are broken deterministically.
 */
export function orderLutEntriesByDagTopology(
  selectedEntries: readonly RetrievalDagPrefillLutEntryV1[]
): { ordered: RetrievalDagPrefillLutEntryV1[]; cyclesBroken: number } {
  if (selectedEntries.length <= 1) {
    return { ordered: [...selectedEntries], cyclesBroken: 0 };
  }

  const byOrdinal = new Map<number, RetrievalDagPrefillLutEntryV1>();
  for (const e of selectedEntries) {
    byOrdinal.set(e.ordinal, e);
  }

  // Edge u -> v means u is a dependency of v (u must appear BEFORE v in prefill prefix)
  const inDegree = new Map<number, number>();
  const adj = new Map<number, Set<number>>();
  for (const e of selectedEntries) {
    inDegree.set(e.ordinal, 0);
    adj.set(e.ordinal, new Set());
  }

  for (const e of selectedEntries) {
    for (const depOrd of e.dependencyOrdinals) {
      if (byOrdinal.has(depOrd) && depOrd !== e.ordinal) {
        const set = adj.get(depOrd)!;
        if (!set.has(e.ordinal)) {
          set.add(e.ordinal);
          inDegree.set(e.ordinal, (inDegree.get(e.ordinal) ?? 0) + 1);
        }
      }
    }
  }

  const remaining = new Set<number>(byOrdinal.keys());
  const ordered: RetrievalDagPrefillLutEntryV1[] = [];
  let cyclesBroken = 0;

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((ord) => (inDegree.get(ord) ?? 0) === 0)
      .sort((a, b) => a - b);

    let chosenOrd: number;
    if (ready.length > 0) {
      chosenOrd = ready[0]!;
    } else {
      // Deterministic cycle-break: pick lowest ordinal among remaining
      chosenOrd = [...remaining].sort((a, b) => a - b)[0]!;
      cyclesBroken++;
    }

    remaining.delete(chosenOrd);
    ordered.push(byOrdinal.get(chosenOrd)!);

    for (const dependentOrd of adj.get(chosenOrd) ?? []) {
      if (remaining.has(dependentOrd)) {
        inDegree.set(dependentOrd, Math.max(0, (inDegree.get(dependentOrd) ?? 1) - 1));
      }
    }
  }

  return { ordered, cyclesBroken };
}

export interface SynthesizedDagPrefillPlanV1 {
  orderedOrdinals: number[];
  cyclesBroken: number;
  promptPlan: PromptPlanV1;
  contextPrefixIdentity: ContextPrefixIdentityV1;
  reuseObservation: ContextPrefixReuseObservationV1;
  stablePrefixByteLength: number;
  kvCachePersisted: false;
}

/**
 * Synthesizes a dependency-ordered `PromptPlanV1` and `ContextPrefixIdentityV1` from a LUT
 * and a list of candidate ordinals returned by GPU/CPU Top-K retrieval.
 */
export function synthesizeRetrievalDagPrefillPlanV1(input: {
  repoRoot: string;
  lut: RetrievalDagPrefillLutV1;
  selectedOrdinals: readonly number[];
  requestId: string;
  contextManifestChecksum: string;
  userQuery: string;
  modelRevision?: string;
  previousStablePrefix?: string;
  maxBytesPerEvidenceSlice?: number;
}): SynthesizedDagPrefillPlanV1 {
  const selectedEntries = input.selectedOrdinals.map((ord) => {
    const entry = input.lut.entries[ord];
    if (!entry) {
      throw new Error(`Invalid LUT ordinal ${ord} (LUT size: ${input.lut.entries.length})`);
    }
    return entry;
  });

  const { ordered, cyclesBroken } = orderLutEntriesByDagTopology(selectedEntries);

  const systemText = 'You are Ornith, the Parent Atlas synthesis and tool-use model. Rely strictly on admitted revision-bound evidence.';
  const instructionText = 'Evidence chunks are ordered topologically (dependencies before dependents) to preserve causal lineage and prefix cache locality.';
  const toolSchemaText = JSON.stringify({
    tools: ['trace_kag_search', 'atlas_inspect_source_span'],
    revision: 'atlas.tools.v1',
  });

  const segments: PromptPlanSegmentV1[] = [];
  const prefixParts: string[] = [];

  const pushSegment = (
    kind: PromptPlanSegmentV1['kind'],
    packetKey: string | null,
    evidenceRefs: string[],
    text: string,
    includeInStablePrefix: boolean
  ) => {
    const contentChecksum = createHash('sha256').update(text, 'utf8').digest('hex');
    const tokenCount = Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
    segments.push({
      ordinal: segments.length,
      kind,
      packetKey,
      evidenceRefs,
      contentChecksum,
      tokenCount,
    });
    if (includeInStablePrefix) {
      prefixParts.push(text);
    }
  };

  pushSegment('SYSTEM', null, ['policy:system:v1'], systemText, true);
  pushSegment('INSTRUCTION', null, ['policy:instruction:v1'], instructionText, true);

  for (const entry of ordered) {
    const slice = readUtf8SourceSpanSlice(
      input.repoRoot,
      entry,
      input.maxBytesPerEvidenceSlice ?? 1024
    );
    const formattedBlock = `/* [ORD:${entry.ordinal}] [ID:${entry.canonicalId}] [REV:${entry.sourceRevision}] [FILE:${entry.sourceRef}] */\n${slice.text}`;
    pushSegment(
      'EVIDENCE',
      entry.packetKey,
      [entry.canonicalId, entry.treeNodeId],
      formattedBlock,
      true
    );
  }

  pushSegment('TOOL_SCHEMA', null, ['schema:atlas.tools.v1'], toolSchemaText, true);
  pushSegment('USER_QUERY', null, [`query:${input.requestId}`], input.userQuery, false);

  const stablePrefix = prefixParts.join('\n---\n');
  const stableEvidenceRevision = createHash('sha256')
    .update(canonicalEncodeV1(ordered.map((e) => [e.canonicalId, e.sourceRevision])), 'utf8')
    .digest('hex');

  const modelRevision = input.modelRevision ?? 'ornith-1.5-9b';
  const promptPlan = buildPromptPlanV1({
    requestId: input.requestId,
    contextManifestChecksum: input.contextManifestChecksum,
    tokenizerRevision: `${modelRevision}:tokenizer:v1`,
    promptTemplateRevision: 'atlas.dag-prefill-template.v1',
    instructionRevision: 'atlas.dag-prefill-instruction.v1',
    segments,
  });

  const contextPrefixIdentity = buildContextPrefixIdentityV1({
    modelRevision,
    templateRevision: 'atlas.dag-prefill-template.v1',
    toolSchemaRevision: 'atlas.tools.v1',
    systemPolicyRevision: 'atlas.system-policy.v1',
    stableEvidenceRevision,
    stablePrefix,
  });

  const stablePrefixTokens = segments
    .filter((s) => s.kind !== 'USER_QUERY')
    .reduce((acc, s) => acc + s.tokenCount, 0);
  const queryTokens = segments
    .filter((s) => s.kind === 'USER_QUERY')
    .reduce((acc, s) => acc + s.tokenCount, 0);

  const isExactPrefixRepeat =
    input.previousStablePrefix !== undefined && input.previousStablePrefix === stablePrefix;

  const reuseObservation = buildContextPrefixReuseObservationV1({
    identity: contextPrefixIdentity,
    stablePrefix,
    previousStablePrefix: input.previousStablePrefix,
    cachedPrefillTokens: isExactPrefixRepeat ? stablePrefixTokens : 0,
    newPrefillTokens: isExactPrefixRepeat ? queryTokens : stablePrefixTokens + queryTokens,
  });

  return {
    orderedOrdinals: ordered.map((e) => e.ordinal),
    cyclesBroken,
    promptPlan,
    contextPrefixIdentity,
    reuseObservation,
    stablePrefixByteLength: Buffer.byteLength(stablePrefix, 'utf8'),
    kvCachePersisted: false,
  };
}
