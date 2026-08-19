import { createHash } from 'node:crypto';
import {
  RepairEvidenceBatchV1Schema,
  RepairEvidenceCandidateV1Schema,
  RepairEvidenceReadRequestV1Schema,
  type RepairEvidenceBatchV1,
  type RepairEvidenceCandidateV1,
  type RepairEvidenceReadOnlyExecutor,
  type RepairEvidenceReadRequestV1,
} from './agentic-repair-evidence-gate.js';

/**
 * Adapter from existing TRACE MCP read paths into the repair evidence gate.
 *
 * The adapter does not own retrieval semantics. It calls the already-registered
 * TRACE tools and only normalizes their outputs. This is important because the
 * same logical semantic/graph evidence must not become a second fusion owner.
 */
export type TraceRepairToolCaller = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type TraceRepairEvidenceAdapterOptions = {
  maxPacketLookups?: number;
  maxAceValidations?: number;
};

function hash16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function clamp01(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function tokenEstimate(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return Math.max(1, Math.ceil(text.length / 4));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function unwrapToolResult(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;

  if (record.structuredContent != null) return record.structuredContent;
  if (record.result != null && record.content == null) return record.result;

  const content = asArray(record.content);
  for (const part of content) {
    const partRecord = asRecord(part);
    const text = stringValue(partRecord?.text);
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return value;
}

function findArray(root: unknown, keys: readonly string[]): unknown[] {
  const record = asRecord(root);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  for (const nested of ['data', 'result', 'results', 'graph', 'context', 'payload']) {
    const found = findArray(record[nested], keys);
    if (found.length) return found;
  }
  return [];
}

function findStringArray(root: unknown, keys: readonly string[]): string[] {
  return uniqueSorted(findArray(root, keys).map(stringValue).filter((value): value is string => Boolean(value)));
}

function packetSourceRef(row: Record<string, unknown>): string | null {
  return stringValue(row.source_ref)
    ?? stringValue(row.sourceRef)
    ?? stringValue(row.file_path)
    ?? stringValue(row.filePath)
    ?? stringValue(row.path);
}

function packetKey(row: Record<string, unknown>): string | null {
  return stringValue(row.packet_key)
    ?? stringValue(row.packetKey)
    ?? stringValue(row.packet_id)
    ?? stringValue(row.packetId);
}

function packetByteStart(row: Record<string, unknown>): number | null {
  return numberValue(row.byte_start) ?? numberValue(row.byteStart) ?? numberValue(row.start_byte) ?? numberValue(row.startByte);
}

function packetSummary(row: Record<string, unknown>): string {
  return stringValue(row.summary)
    ?? stringValue(row.content)
    ?? stringValue(row.text)
    ?? stringValue(row.snippet)
    ?? '';
}

function observedRevision(row: Record<string, unknown>): string | null {
  return stringValue(row.source_revision)
    ?? stringValue(row.sourceRevision)
    ?? stringValue(row.revision);
}

function canonicalPacketCandidate(
  row: Record<string, unknown>,
  ordinal: number,
  executor: string,
): RepairEvidenceCandidateV1 | null {
  const sourceRef = packetSourceRef(row);
  const key = packetKey(row);
  if (!sourceRef || !key) return null;
  const summary = packetSummary(row);
  const sha = stringValue(row.sha256) ?? stringValue(row.content_sha256) ?? stringValue(row.contentHash);
  const start = packetByteStart(row);
  const exactEvidence = Boolean(sha && start != null);

  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: `packet:${key}`,
    packetKey: key,
    sourceRef,
    sourceRevision: observedRevision(row),
    ordinal,
    tokenCount: tokenEstimate(summary || sourceRef),
    semanticScore: clamp01(row.semantic_score ?? row.semanticScore ?? row.score),
    lexicalScore: clamp01(row.lexical_score ?? row.lexicalScore ?? row.reward_prior ?? row.rewardPrior),
    graphAuthority: clamp01(row.pagerank ?? row.pageRank ?? row.graph_authority ?? row.graphAuthority),
    centroidAffinity: clamp01(row.centroid_score ?? row.centroidScore),
    cacheHotness: clamp01(row.cache_hotness ?? row.cacheHotness),
    demandUtility: clamp01(row.demand_utility ?? row.demandUtility ?? row.reward_prior ?? row.rewardPrior),
    executionUtility: clamp01(row.execution_utility ?? row.executionUtility),
    recency: clamp01(row.recency),
    normalizedCost: clamp01(row.normalized_cost ?? row.normalizedCost),
    hopDistance: null,
    pathCost: null,
    communityId: stringValue(row.community_id) ?? stringValue(row.communityId) ?? stringValue(row.cluster_id) ?? stringValue(row.clusterId),
    communityOverlap: clamp01(row.community_overlap ?? row.communityOverlap),
    pprAffinity: clamp01(row.ppr ?? row.pprAffinity),
    exactEvidence,
    contentRef: sha ? `sha256:${sha}` : `packet:${key}`,
    lanes: ['canonical'],
    executors: [executor],
    evidenceRefs: uniqueSorted([
      `packet:${key}`,
      ...(sha ? [`sha256:${sha}`] : []),
      ...(start != null ? [`byte-start:${start}`] : []),
    ]),
  });
}

function normalizePacketRows(raw: unknown, executor: string): RepairEvidenceCandidateV1[] {
  const root = unwrapToolResult(raw);
  const rows = findArray(root, ['packets', 'rows', 'results', 'items', 'hits']);
  const records = rows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));

  // Source order is derived only from observed byte starts. Rows without a byte
  // coordinate follow deterministically after grounded rows; this is a retrieval
  // ordinal, never a fabricated Tree-sitter structural ordinal.
  records.sort((a, b) => {
    const sourceA = packetSourceRef(a) ?? '';
    const sourceB = packetSourceRef(b) ?? '';
    if (sourceA !== sourceB) return sourceA.localeCompare(sourceB);
    const byteA = packetByteStart(a);
    const byteB = packetByteStart(b);
    if (byteA != null && byteB != null && byteA !== byteB) return byteA - byteB;
    if (byteA != null && byteB == null) return -1;
    if (byteA == null && byteB != null) return 1;
    return (packetKey(a) ?? '').localeCompare(packetKey(b) ?? '');
  });

  const sourceOrdinals = new Map<string, number>();
  const out: RepairEvidenceCandidateV1[] = [];
  for (const row of records) {
    const sourceRef = packetSourceRef(row);
    if (!sourceRef) continue;
    const ordinal = sourceOrdinals.get(sourceRef) ?? 0;
    sourceOrdinals.set(sourceRef, ordinal + 1);
    const candidate = canonicalPacketCandidate(row, ordinal, executor);
    if (candidate) out.push(candidate);
  }
  return out;
}

function semanticCandidate(row: Record<string, unknown>, ordinal: number, executor: string): RepairEvidenceCandidateV1 | null {
  const sourceRef = packetSourceRef(row);
  if (!sourceRef) return null;
  const key = packetKey(row);
  const score = clamp01(row.score ?? row.similarity ?? row.semantic_score ?? row.dense_score ?? row.relevance);
  const content = packetSummary(row);
  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: key ? `packet:${key}` : `semantic:${hash16(`${sourceRef}\0${ordinal}\0${content.slice(0, 96)}`)}`,
    packetKey: key,
    sourceRef,
    sourceRevision: observedRevision(row),
    ordinal,
    tokenCount: tokenEstimate(content || sourceRef),
    semanticScore: score,
    lexicalScore: clamp01(row.lexical_score ?? row.bm25_score ?? row.fts_score),
    graphAuthority: clamp01(row.pagerank ?? row.graphAuthority),
    centroidAffinity: clamp01(row.centroidScore ?? row.centroid_score),
    cacheHotness: clamp01(row.cacheHotness ?? row.cache_hotness),
    demandUtility: clamp01(row.demandUtility ?? row.demand_utility),
    executionUtility: clamp01(row.executionUtility ?? row.execution_utility),
    recency: clamp01(row.recency),
    normalizedCost: clamp01(row.normalizedCost ?? row.normalized_cost),
    hopDistance: null,
    pathCost: null,
    communityId: stringValue(row.communityId) ?? stringValue(row.community_id) ?? stringValue(row.clusterId) ?? stringValue(row.cluster_id),
    communityOverlap: clamp01(row.communityOverlap ?? row.community_overlap),
    pprAffinity: clamp01(row.pprAffinity ?? row.ppr),
    exactEvidence: false,
    contentRef: stringValue(row.content_ref) ?? stringValue(row.contentRef) ?? `source:${sourceRef}`,
    lanes: ['semantic'],
    executors: [executor],
    evidenceRefs: uniqueSorted([
      ...(key ? [`packet:${key}`] : []),
      `source:${sourceRef}`,
    ]),
  });
}

function normalizeSemanticRows(raw: unknown, executor: string): RepairEvidenceCandidateV1[] {
  const root = unwrapToolResult(raw);
  const rows = findArray(root, ['hits', 'results', 'candidates', 'items', 'chunks', 'contexts']);
  return rows
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row, index) => semanticCandidate(row, index, executor))
    .filter((row): row is RepairEvidenceCandidateV1 => Boolean(row));
}

function graphCandidate(sourceRef: string, ordinal: number, raw: Record<string, unknown> | null, executor: string): RepairEvidenceCandidateV1 {
  return RepairEvidenceCandidateV1Schema.parse({
    candidateId: `graph:${hash16(sourceRef)}`,
    packetKey: null,
    sourceRef,
    sourceRevision: null,
    ordinal,
    tokenCount: 1,
    semanticScore: 0,
    lexicalScore: 0,
    graphAuthority: clamp01(raw?.pagerank ?? raw?.pageRank ?? raw?.authority ?? raw?.score),
    centroidAffinity: 0,
    cacheHotness: 0,
    demandUtility: 0,
    executionUtility: 0,
    recency: 0,
    normalizedCost: 0,
    hopDistance: numberValue(raw?.hop ?? raw?.hops ?? raw?.depth),
    pathCost: numberValue(raw?.pathCost ?? raw?.path_cost),
    communityId: stringValue(raw?.communityId) ?? stringValue(raw?.community_id) ?? stringValue(raw?.clusterId) ?? stringValue(raw?.cluster_id),
    communityOverlap: clamp01(raw?.communityOverlap ?? raw?.community_overlap),
    pprAffinity: clamp01(raw?.ppr ?? raw?.pprAffinity),
    exactEvidence: false,
    contentRef: `source:${sourceRef}`,
    lanes: ['graph'],
    executors: [executor],
    evidenceRefs: [`graph-source:${sourceRef}`],
  });
}

function normalizeGraphRows(raw: unknown, executor: string): RepairEvidenceCandidateV1[] {
  const root = unwrapToolResult(raw);
  const sourceRefs = findStringArray(root, ['sourceRefs', 'source_refs']);
  const nodeRows = findArray(root, ['nodes', 'neighbors'])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const bySource = new Map<string, Record<string, unknown>>();
  for (const row of nodeRows) {
    const source = packetSourceRef(row)
      ?? stringValue(row.stable_key)?.replace(/^file:/, '')
      ?? stringValue(row.stableKey)?.replace(/^file:/, '');
    if (source) bySource.set(source, row);
  }
  for (const source of bySource.keys()) sourceRefs.push(source);

  return uniqueSorted(sourceRefs).map((sourceRef, ordinal) => graphCandidate(sourceRef, ordinal, bySource.get(sourceRef) ?? null, executor));
}

function revisionFromCandidates(candidates: readonly RepairEvidenceCandidateV1[]): string | null {
  const values = uniqueSorted(candidates.map((row) => row.sourceRevision).filter((value): value is string => Boolean(value)));
  return values.length === 1 ? values[0] : null;
}

function makeBatch(input: {
  library: RepairEvidenceBatchV1['library'];
  executor: string;
  backend: string;
  latencyMs: number;
  candidates: RepairEvidenceCandidateV1[];
  extraSourceRefs?: string[];
  extraEvidenceRefs?: string[];
  cacheHitCount?: number;
  cacheProbeCount?: number;
  degraded?: boolean;
  reasonCodes: string[];
}): RepairEvidenceBatchV1 {
  return RepairEvidenceBatchV1Schema.parse({
    schema: 'atlas.repair-evidence-batch.v1',
    library: input.library,
    executor: input.executor,
    backend: input.backend,
    reachable: true,
    degraded: input.degraded ?? false,
    latencyMs: input.latencyMs,
    observedRevision: revisionFromCandidates(input.candidates),
    candidates: input.candidates,
    sourceRefs: uniqueSorted([...input.candidates.map((row) => row.sourceRef), ...(input.extraSourceRefs ?? [])]),
    evidenceRefs: uniqueSorted([...input.candidates.flatMap((row) => row.evidenceRefs), ...(input.extraEvidenceRefs ?? [])]),
    cacheHitCount: input.cacheHitCount ?? 0,
    cacheProbeCount: input.cacheProbeCount ?? 0,
    reasonCodes: input.reasonCodes,
  });
}

async function timedCall(caller: TraceRepairToolCaller, name: string, args: Record<string, unknown>): Promise<{ value: unknown; latencyMs: number }> {
  const start = performance.now();
  const value = await caller(name, args);
  return { value, latencyMs: Math.max(0, performance.now() - start) };
}

function normalizeToolReachability(raw: unknown): boolean {
  const value = unwrapToolResult(raw);
  const record = asRecord(value);
  if (!record) return true;
  if (record.ok === false || record.success === false) return false;
  if (stringValue(record.status)?.toLowerCase() === 'error') return false;
  return true;
}

function extractAceCacheState(raw: unknown): { hits: number; probes: number; evidenceRefs: string[] } {
  const root = unwrapToolResult(raw);
  const record = asRecord(root);
  if (!record) return { hits: 0, probes: 1, evidenceRefs: [] };
  const cache = asRecord(record.cache) ?? asRecord(record.cacheChecks) ?? record;
  const boolValues = Object.entries(cache)
    .filter(([key, value]) => /cache|hit|redis|ace/i.test(key) && typeof value === 'boolean')
    .map(([, value]) => value as boolean);
  const refs = uniqueSorted([
    ...findStringArray(root, ['evidenceRefs', 'evidence_refs']),
    ...findStringArray(root, ['cacheKeys', 'cache_keys']),
  ]);
  return {
    hits: boolValues.filter(Boolean).length,
    probes: Math.max(1, boolValues.length),
    evidenceRefs: refs,
  };
}

export function createTraceRepairEvidenceExecutor(
  caller: TraceRepairToolCaller,
  options: TraceRepairEvidenceAdapterOptions = {},
): RepairEvidenceReadOnlyExecutor {
  const maxPacketLookups = Math.max(1, Math.min(options.maxPacketLookups ?? 8, 32));
  const maxAceValidations = Math.max(1, Math.min(options.maxAceValidations ?? 8, 24));

  return {
    async packetLookup(rawRequest) {
      const request = RepairEvidenceReadRequestV1Schema.parse(rawRequest);
      const targets = uniqueSorted(request.targetFiles).slice(0, maxPacketLookups);
      const start = performance.now();
      const all: RepairEvidenceCandidateV1[] = [];
      const evidenceRefs: string[] = [];
      for (const sourceRef of targets) {
        const raw = await caller('atlas.packet_search', {
          source_ref: sourceRef,
          limit: Math.min(request.topK, 50),
        });
        all.push(...normalizePacketRows(raw, 'trace:atlas.packet_search'));
        evidenceRefs.push(`trace-tool:atlas.packet_search:${sourceRef}`);
      }
      return makeBatch({
        library: 'PACKET_FABRIC',
        executor: 'trace:atlas.packet_search',
        backend: 'postgres:atlas_packets',
        latencyMs: performance.now() - start,
        candidates: all,
        extraSourceRefs: targets,
        extraEvidenceRefs: evidenceRefs,
        degraded: targets.length === 0 || all.length === 0,
        reasonCodes: all.length
          ? ['CANONICAL_PACKET_LOOKUP', 'REVISION_REQUIRES_OBSERVED_SOURCE_REVISION']
          : ['NO_CANONICAL_PACKET_MATCH'],
      });
    },

    async semanticSearch(rawRequest) {
      const request = RepairEvidenceReadRequestV1Schema.parse(rawRequest);
      const { value, latencyMs } = await timedCall(caller, 'trace.kag_search', {
        query: request.queryText,
        limit: Math.min(request.topK, 50),
      });
      const candidates = normalizeSemanticRows(value, 'trace:trace.kag_search');
      return makeBatch({
        library: 'QDRANT',
        executor: 'trace:trace.kag_search',
        backend: 'kag-dag:go-sveltekit-postgres-cascade',
        latencyMs,
        candidates,
        degraded: !normalizeToolReachability(value) || candidates.length === 0,
        reasonCodes: [
          'TRACE_PRIMARY_KAG_RETRIEVAL',
          'BACKEND_CASCADE_MEANS_QDRANT_EXECUTOR_NOT_PROVEN_PER_HIT',
          'NO_INDEPENDENT_SEMANTIC_LANE_VOTE',
        ],
      });
    },

    async graphExpand(rawRequest) {
      const request = RepairEvidenceReadRequestV1Schema.parse(rawRequest);
      const seedSourceRefs = uniqueSorted(rawRequest.seedSourceRefs).slice(0, Math.min(request.graphFanout, 24));
      const requestedHops = request.graphHops;
      const maxHops = Math.max(1, Math.min(requestedHops || 1, 2));
      const { value, latencyMs } = await timedCall(caller, 'graph.expand_neighborhood', {
        sourceRefs: seedSourceRefs,
        maxHops,
        limit: Math.min(request.graphFanout, 24),
        query: request.queryText,
      });
      const candidates = normalizeGraphRows(value, 'trace:graph.expand_neighborhood');
      return makeBatch({
        library: 'GRAPH_EXPANDER',
        executor: 'trace:graph.expand_neighborhood',
        backend: 'sveltekit-traverse:neo4j-fallback',
        latencyMs,
        candidates,
        extraSourceRefs: seedSourceRefs,
        degraded: !normalizeToolReachability(value) || requestedHops > 2,
        reasonCodes: [
          'READ_ONLY_GRAPH_EXPANSION',
          ...(requestedHops > 2 ? ['TRACE_GRAPH_MAX_HOPS_CLAMPED_TO_2'] : []),
          'GRAPH_EVIDENCE_IS_FEATURE_INPUT_NOT_ANSWER',
        ],
      });
    },

    async aceValidate(rawRequest) {
      const request = RepairEvidenceReadRequestV1Schema.parse(rawRequest);
      const targets = uniqueSorted(rawRequest.candidateSourceRefs).slice(0, maxAceValidations);
      const start = performance.now();
      let hits = 0;
      let probes = 0;
      const evidenceRefs: string[] = [];
      const candidates: RepairEvidenceCandidateV1[] = [];
      for (const [ordinal, filePath] of targets.entries()) {
        const raw = await caller('trace.validate_ace_hit', { filePath });
        const state = extractAceCacheState(raw);
        hits += state.hits;
        probes += state.probes;
        evidenceRefs.push(...state.evidenceRefs, `trace-tool:trace.validate_ace_hit:${filePath}`);
        const root = asRecord(unwrapToolResult(raw));
        candidates.push(RepairEvidenceCandidateV1Schema.parse({
          candidateId: `ace:${hash16(filePath)}`,
          packetKey: stringValue(root?.packetKey) ?? stringValue(root?.packet_key),
          sourceRef: filePath,
          sourceRevision: stringValue(root?.sourceRevision) ?? stringValue(root?.source_revision),
          ordinal,
          tokenCount: 1,
          semanticScore: 0,
          lexicalScore: 0,
          graphAuthority: clamp01(root?.pagerank ?? root?.graphAuthority),
          centroidAffinity: 0,
          cacheHotness: probes > 0 ? hits / probes : 0,
          demandUtility: 0,
          executionUtility: 0,
          recency: 0,
          normalizedCost: 0,
          hopDistance: null,
          pathCost: null,
          communityId: stringValue(root?.communityId) ?? stringValue(root?.community_id),
          communityOverlap: 0,
          pprAffinity: 0,
          exactEvidence: false,
          contentRef: `source:${filePath}`,
          lanes: ['context'],
          executors: ['trace:trace.validate_ace_hit'],
          evidenceRefs: uniqueSorted([`source:${filePath}`, ...state.evidenceRefs]),
        }));
      }
      return makeBatch({
        library: 'ACE',
        executor: 'trace:trace.validate_ace_hit',
        backend: 'redis+graph+postgres-validation',
        latencyMs: performance.now() - start,
        candidates,
        extraSourceRefs: targets,
        extraEvidenceRefs: evidenceRefs,
        cacheHitCount: hits,
        cacheProbeCount: probes,
        degraded: targets.length === 0,
        reasonCodes: ['ACE_VALIDATION_ONLY', 'NO_CACHE_WARM_AUTHORIZED'],
      });
    },

    async centroidLookup(rawRequest) {
      const request = RepairEvidenceReadRequestV1Schema.parse(rawRequest);
      const { value, latencyMs } = await timedCall(caller, 'atlas.prefilter', {
        query: request.queryText,
        topK: Math.min(8, request.topK),
      });
      const root = asRecord(unwrapToolResult(value));
      const clusterIds = findArray(root, ['clusterIds', 'cluster_ids']).map((entry) => String(entry));
      const centroidScores = findArray(root, ['centroidScores', 'centroid_scores']).map((entry) => clamp01(entry));
      const candidates = clusterIds.map((clusterId, ordinal) => RepairEvidenceCandidateV1Schema.parse({
        candidateId: `centroid:${clusterId}`,
        packetKey: null,
        sourceRef: `cluster:${clusterId}`,
        sourceRevision: null,
        ordinal,
        tokenCount: 1,
        semanticScore: 0,
        lexicalScore: 0,
        graphAuthority: 0,
        centroidAffinity: centroidScores[ordinal] ?? 0,
        cacheHotness: 0,
        demandUtility: 0,
        executionUtility: 0,
        recency: 0,
        normalizedCost: 0,
        hopDistance: null,
        pathCost: null,
        communityId: clusterId,
        communityOverlap: 0,
        pprAffinity: 0,
        exactEvidence: false,
        contentRef: `centroid:${clusterId}`,
        lanes: ['centroid'],
        executors: ['trace:atlas.prefilter'],
        evidenceRefs: [`centroid:${clusterId}`],
      }));
      return makeBatch({
        library: 'CENTROID_CACHE',
        executor: 'trace:atlas.prefilter',
        backend: stringValue(root?.backend) ?? 'turbovec-prefilter',
        latencyMs,
        candidates,
        degraded: !normalizeToolReachability(value) || candidates.length === 0,
        reasonCodes: ['CENTROID_ROUTING_HINT_ONLY', 'CENTROID_DOES_NOT_CREATE_CANONICAL_IDENTITY'],
      });
    },
  };
}
