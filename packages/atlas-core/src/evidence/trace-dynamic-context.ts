import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  type EvidenceItem,
  type ProofStatus,
  type StaticDiscoveryLoader,
  type TraceDynamicContextOptions,
  type TraceDynamicContextRequest,
  type TraceDynamicContextResult,
  type TraceEvidenceLane,
  traceDynamicContextRequestSchema,
} from './trace-dynamic-context.types.js';
import { canonicalJoinEvidence, buildCanonicalJoinBackQuery } from './lanes/postgres.js';
import { defaultStaticDiscoveryPatterns, scanStaticRegexEvidence } from './lanes/static-rg.js';
import { traceDynamicContextResultToWorkflowTrace } from './trace-dynamic-context-trace.js';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function pickTargetResolution(request: TraceDynamicContextRequest): TraceDynamicContextResult['targetResolution'] {
  const target = request.target;
  if (!target) return { kind: 'unknown' };
  if (target.symbolVersionId) return { kind: 'symbol_version', value: target.symbolVersionId };
  if (target.symbolId) return { kind: 'symbol', value: target.symbolId };
  if (target.packetKey) return { kind: 'packet', value: target.packetKey };
  if (target.filePath) return { kind: 'file', value: target.filePath };
  if (target.route) return { kind: 'route', value: target.route };
  if (target.traceId) return { kind: 'trace', value: target.traceId };
  return { kind: 'unknown' };
}

function scoreStatus(items: EvidenceItem[]): ProofStatus {
  if (items.length === 0) return 'NOT_PROVEN';
  if (items.some((item) => item.status === 'CONTRADICTED')) return 'CONTRADICTED';
  if (items.every((item) => item.status === 'PROVEN')) return 'PROVEN';
  return 'PARTIAL_PROVEN';
}

function partitionEvidence(items: EvidenceItem[]) {
  return {
    lexicalHits: items.filter((item) => item.lane === 'lexical'),
    semanticHits: items.filter((item) => item.lane === 'semantic'),
    graphHits: items.filter((item) => item.lane === 'dependency_graph'),
    runtimeHits: items.filter((item) => item.lane === 'runtime' || item.lane === 'browser' || item.lane === 'telemetry'),
  };
}

function limitEvidence(items: EvidenceItem[], request: TraceDynamicContextRequest): EvidenceItem[] {
  const cap = Math.max(1, request.limits.topK + request.limits.maxFiles + request.limits.maxSymbols);
  return items.slice(0, cap);
}

async function loadStaticSourceText(
  filePath: string | undefined,
  sourceText: string | undefined,
  loader?: StaticDiscoveryLoader
): Promise<string | null> {
  if (typeof sourceText === 'string' && sourceText.length > 0) return sourceText;
  if (!filePath) return null;
  if (loader) {
    const loaded = await loader(filePath);
    if (typeof loaded === 'string' && loaded.length > 0) return loaded;
  }
  try {
    const text = await readFile(filePath, 'utf8');
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function runFirstSliceAdapters(
  request: TraceDynamicContextRequest,
  firstSlice: TraceDynamicContextOptions['firstSlice']
): Promise<{ evidence: EvidenceItem[]; sourceId?: string; sourceVersionId?: string; packetKey?: string; symbolId?: string; symbolVersionId?: string }> {
  const evidence: EvidenceItem[] = [];
  let sourceId: string | undefined;
  let sourceVersionId: string | undefined;
  let packetKey: string | undefined;
  let symbolId: string | undefined;
  let symbolVersionId: string | undefined;

  const staticDiscovery = firstSlice?.staticDiscovery;
  if (staticDiscovery) {
    const filePath = staticDiscovery.filePath ?? request.target?.filePath;
    const sourceText = await loadStaticSourceText(filePath, staticDiscovery.sourceText, staticDiscovery.loadSourceText);
    if (sourceText && filePath) {
      const patterns = staticDiscovery.patterns ?? defaultStaticDiscoveryPatterns(request.question);
      const staticEvidence = scanStaticRegexEvidence({
        filePath,
        sourceText,
        sourceRevision: staticDiscovery.sourceRevision ?? request.sourceRevision,
        patterns,
      });
      evidence.push(...staticEvidence);
      sourceId = filePath;
      sourceVersionId = staticDiscovery.sourceRevision ?? request.sourceRevision ?? undefined;
    }
  }

  const postgresJoinBack = firstSlice?.postgresJoinBack;
  const packetKeys = postgresJoinBack?.packetKeys ?? (request.target?.packetKey ? [request.target.packetKey] : []);
  if (postgresJoinBack && packetKeys.length > 0) {
    const { sql, params } = buildCanonicalJoinBackQuery({
      tableName: postgresJoinBack.tableName,
      packetKeys,
      limit: postgresJoinBack.limit,
    });
    const result = await postgresJoinBack.query(sql, params);
    for (const row of result.rows) {
      const typed = row as {
        packet_key?: string;
        source_ref?: string;
        feature_id?: string;
        canonical_source_ref?: string;
        workspace_revision?: number;
        representation_revision?: number;
      };
      const joinEvidence = canonicalJoinEvidence({
        packetKey: typed.packet_key ?? packetKeys[0],
        sourceRef: typed.canonical_source_ref ?? typed.source_ref,
        sourceRevision:
          request.sourceRevision ??
          (typed.workspace_revision !== undefined ? String(typed.workspace_revision) : undefined) ??
          (typed.representation_revision !== undefined ? String(typed.representation_revision) : undefined),
        representationId: typed.feature_id,
      });
      evidence.push(joinEvidence);
      packetKey = typed.packet_key ?? packetKey;
      sourceId = typed.canonical_source_ref ?? typed.source_ref ?? sourceId;
      sourceVersionId =
        request.sourceRevision ??
        (typed.workspace_revision !== undefined ? String(typed.workspace_revision) : sourceVersionId) ??
        (typed.representation_revision !== undefined ? String(typed.representation_revision) : sourceVersionId);
    }
  }

  return {
    evidence,
    sourceId,
    sourceVersionId,
    packetKey,
    symbolId,
    symbolVersionId,
  };
}

export async function traceDynamicContext(
  input: TraceDynamicContextRequest,
  options: TraceDynamicContextOptions = {}
): Promise<TraceDynamicContextResult> {
  const request = traceDynamicContextRequestSchema.parse(input);
  const lanes = options.lanes ?? [];
  const laneByName = new Map<TraceEvidenceLane['lane'], TraceEvidenceLane[]>();

  for (const lane of lanes) {
    const list = laneByName.get(lane.lane) ?? [];
    list.push(lane);
    laneByName.set(lane.lane, list);
  }

  const evidence: EvidenceItem[] = [];
  const firstSlice = await runFirstSliceAdapters(request, options.firstSlice);
  evidence.push(...firstSlice.evidence);
  for (const laneName of request.lanes) {
    const adapters = laneByName.get(laneName) ?? [];
    for (const adapter of adapters) {
      const laneEvidence = await adapter.collect(request);
      evidence.push(...laneEvidence);
    }
  }

  const boundedEvidence = limitEvidence(evidence, request);
  const partitions = partitionEvidence(boundedEvidence);
  const status = scoreStatus(boundedEvidence);
  const traceId = request.target?.traceId ?? request.workspaceRevision;
  const generatedAt = new Date().toISOString();
  const queryDigest = sha256({
    workspaceId: request.workspaceId,
    question: request.question,
    target: request.target ?? null,
    workspaceRevision: request.workspaceRevision,
    sourceRevision: request.sourceRevision ?? null,
    lanes: request.lanes,
    limits: request.limits,
  });
  const evidenceDigest = sha256(boundedEvidence);

  const result: TraceDynamicContextResult = {
    traceId,
    workspaceRevision: request.workspaceRevision,
    targetResolution: pickTargetResolution(request),
    sourceId: firstSlice.sourceId ?? request.target?.filePath,
    sourceVersionId: firstSlice.sourceVersionId ?? request.sourceRevision,
    symbolId: firstSlice.symbolId ?? request.target?.symbolId,
    symbolVersionId: firstSlice.symbolVersionId ?? request.target?.symbolVersionId,
    parseNodeId: undefined,
    packetKey: firstSlice.packetKey ?? request.target?.packetKey,
    confidence: boundedEvidence.length === 0 ? 0 : Math.min(1, 0.25 + boundedEvidence.length * 0.1),
    methods: request.lanes.slice(),
    evidence: boundedEvidence,
    retrieval: partitions,
    runtime: {
      httpRequests: [],
      consoleErrors: [],
      networkFailures: [],
    },
    validation: {
      status,
      passedGates: boundedEvidence.filter((item) => item.status === 'PROVEN').map((item) => item.kind),
      failedGates: boundedEvidence.filter((item) => item.status === 'CONTRADICTED').map((item) => item.kind),
      unresolvedClaims: boundedEvidence.filter((item) => item.status === 'NOT_PROVEN').map((item) => item.kind),
    },
    provenance: {
      generatedAt,
      toolVersions: {
        'atlas-core': options.toolVersions?.['atlas-core'] ?? 'workspace',
        ...options.toolVersions,
      },
      queryDigest,
      evidenceDigest,
    },
  };

  await options.validationWriter?.record(result);
  await options.workflowTraceWriter?.(traceDynamicContextResultToWorkflowTrace(request, result));
  return result;
}

export function createTraceDynamicContext(options: TraceDynamicContextOptions = {}) {
  return {
    run: (request: TraceDynamicContextRequest) => traceDynamicContext(request, options),
  };
}
