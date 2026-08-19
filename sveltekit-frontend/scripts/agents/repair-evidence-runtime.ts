import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  AgenticRepairEvidenceGateInputV1Schema,
  buildAgenticRepairEvidenceGate,
  RepairEvidenceBatchV1Schema,
  type AgenticRepairEvidenceGateResultV1,
  type RepairEvidenceBatchV1,
  type RepairEvidenceReadOnlyExecutor,
} from '../../src/lib/server/atlas/ranking/agentic-repair-evidence-gate.js';
import {
  rebuildRepairAfterSemanticPromotion,
  type SemanticPromotionFeedbackResultV1,
} from '../../src/lib/server/atlas/ranking/semantic-promotion-feedback.js';
import {
  buildMeasuredTangPolicyReceipt,
  measureSearchPolicyMatrixDiagnostics,
  type MeasuredMatrixDiagnosticsReceiptV1,
  type MeasuredTangPolicyReceiptV1,
} from '../../src/lib/server/atlas/ranking/measured-matrix-diagnostics.js';
import { createTraceRepairEvidenceExecutor } from '../../src/lib/server/atlas/ranking/trace-repair-evidence-adapter.js';
import { resolveSourceRevisionsFromPostgres } from '../../src/lib/server/atlas/identity/source-revision-resolver.js';
import { runCanonicalRepairSemanticTournament } from '../../src/lib/server/atlas/retrieval/canonical-repair-semantic-tournament.js';
import type { RepairSemanticTournamentReceiptV1 } from '../../src/lib/server/atlas/retrieval/repair-semantic-corpus.js';

export type RepairEvidenceRuntimeOptions = {
  appRoot: string;
  traceMcpUrl?: string;
  graphRevision?: string | null;
  featureRevision?: string | null;
  producerRevision?: string;
  enableSemanticTournament?: boolean;
  semanticTournamentTopK?: number;
};

export type RepairEvidenceEvaluation = {
  result: AgenticRepairEvidenceGateResultV1;
  semanticTournament: RepairSemanticTournamentReceiptV1 | null;
  semanticPromotionFeedback: SemanticPromotionFeedbackResultV1 | null;
  measuredMatrixDiagnostics: MeasuredMatrixDiagnosticsReceiptV1 | null;
  measuredTangPolicy: MeasuredTangPolicyReceiptV1 | null;
  lineage: {
    workspaceRevision: string;
    sourceRevision: string;
    graphRevision: string;
    featureRevision: string;
    fullyRevisionAlignedExactEvidence: boolean;
    unresolvedRevisionFields: string[];
  };
  dryRunAllowed: boolean;
  applyAllowedByEvidence: false;
  reasonCodes: string[];
};

function gitHead(appRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function unresolved(name: string): string {
  return `unresolved:${name}`;
}

function isResolvedRevision(value: string): boolean {
  return !value.startsWith('unresolved:');
}

function sourcePath(appRoot: string, sourceRef: string): string {
  const normalized = sourceRef.replace(/^file:/, '').replace(/^sveltekit-frontend\//, '');
  return path.isAbsolute(normalized) ? normalized : path.resolve(appRoot, normalized);
}

function sourceRevisionFromGit(appRoot: string, sourceRef: string): string | null {
  try {
    const absolute = sourcePath(appRoot, sourceRef);
    const relative = path.relative(appRoot, absolute).replace(/\\/g, '/');
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;

    // A dirty or untracked file is not represented by the current immutable git
    // revision. Do not hash the bytes and call that a source_revision: content
    // hash and source revision are separate contracts in Parent Atlas.
    const status = execFileSync('git', ['status', '--porcelain', '--', relative], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (status) return null;

    return gitHead(appRoot);
  } catch {
    return null;
  }
}

function extractTextContent(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const record = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
  if (record.structuredContent != null) return record.structuredContent;
  for (const part of record.content ?? []) {
    if (part.type !== 'text' || typeof part.text !== 'string') continue;
    try {
      return JSON.parse(part.text);
    } catch {
      return { text: part.text };
    }
  }
  return result;
}

async function enrichBatchWithCanonicalSourceRevision(
  batch: RepairEvidenceBatchV1,
): Promise<RepairEvidenceBatchV1> {
  if (!batch.candidates.length) return batch;

  const resolutions = await resolveSourceRevisionsFromPostgres(batch.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    packetKey: candidate.packetKey,
    sourceRef: candidate.sourceRef,
  })));
  const byCandidate = new Map(resolutions.map((resolution) => [resolution.candidateId, resolution]));

  const candidates = batch.candidates.map((candidate) => {
    const resolution = byCandidate.get(candidate.candidateId);
    if (!resolution?.sourceRevision) return candidate;
    return {
      ...candidate,
      sourceRevision: resolution.sourceRevision,
      evidenceRefs: [...new Set([
        ...candidate.evidenceRefs,
        ...resolution.evidenceRefs,
        `source-revision-status:${resolution.status}`,
      ])].sort((a, b) => a.localeCompare(b)),
    };
  });
  const observedRevisions = [...new Set(
    candidates.map((candidate) => candidate.sourceRevision).filter((value): value is string => Boolean(value)),
  )].sort((a, b) => a.localeCompare(b));

  const resolutionReasonCodes = resolutions.map((resolution) =>
    `SOURCE_REVISION_${resolution.status}:${resolution.candidateId}`,
  );

  return RepairEvidenceBatchV1Schema.parse({
    ...batch,
    candidates,
    observedRevision: observedRevisions.length === 1 ? observedRevisions[0] : null,
    evidenceRefs: [...new Set([
      ...batch.evidenceRefs,
      ...resolutions.flatMap((resolution) => resolution.evidenceRefs),
    ])].sort((a, b) => a.localeCompare(b)),
    reasonCodes: [...new Set([...batch.reasonCodes, ...resolutionReasonCodes])],
    degraded: batch.degraded || resolutions.some((resolution) =>
      resolution.status === 'AMBIGUOUS'
      || resolution.status === 'UNVERSIONED'
      || resolution.status === 'MISSING',
    ),
  });
}

function withCanonicalRevisionResolution(
  base: RepairEvidenceReadOnlyExecutor,
): RepairEvidenceReadOnlyExecutor {
  return {
    async packetLookup(request) {
      return enrichBatchWithCanonicalSourceRevision(await base.packetLookup(request));
    },
    async semanticSearch(request) {
      return enrichBatchWithCanonicalSourceRevision(await base.semanticSearch(request));
    },
    async graphExpand(request) {
      return enrichBatchWithCanonicalSourceRevision(await base.graphExpand(request));
    },
    async aceValidate(request) {
      return enrichBatchWithCanonicalSourceRevision(await base.aceValidate(request));
    },
    async centroidLookup(request) {
      return enrichBatchWithCanonicalSourceRevision(await base.centroidLookup(request));
    },
  };
}

export function createRepairEvidenceRuntime(options: RepairEvidenceRuntimeOptions) {
  const appRoot = path.resolve(options.appRoot);
  const producerRevision = options.producerRevision ?? 'repair-evidence-runtime.v5';
  const traceUrl = new URL(options.traceMcpUrl ?? process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788/sse');
  let client: McpClient | null = null;
  let transport: StreamableHTTPClientTransport | null = null;
  let connectionError: Error | null = null;

  async function ensureClient(): Promise<McpClient> {
    if (client) return client;
    if (connectionError) throw connectionError;
    try {
      transport = new StreamableHTTPClientTransport(traceUrl);
      client = new McpClient(
        { name: 'parent-atlas-repair-evidence', version: '5.0.0' },
        { capabilities: {} },
      );
      await client.connect(transport);
      return client;
    } catch (error) {
      connectionError = error instanceof Error ? error : new Error(String(error));
      client = null;
      try { await transport?.close(); } catch { /* ignore close failure */ }
      transport = null;
      throw connectionError;
    }
  }

  const traceExecutor = createTraceRepairEvidenceExecutor(async (name, args) => {
    const active = await ensureClient();
    const result = await active.callTool({ name, arguments: args });
    return extractTextContent(result);
  });
  const executor = withCanonicalRevisionResolution(traceExecutor);

  async function evaluate(input: {
    requestId: string;
    queryText: string;
    targetFiles: string[];
    sourceRef: string;
    workspaceRevision?: string | null;
    sourceRevision?: string | null;
    graphRevision?: string | null;
    featureRevision?: string | null;
  }): Promise<RepairEvidenceEvaluation> {
    const observedWorkspaceRevision = input.workspaceRevision
      ?? process.env.ATLAS_WORKSPACE_REVISION
      ?? gitHead(appRoot)
      ?? unresolved('workspace_revision');
    const observedSourceRevision = input.sourceRevision
      ?? process.env.ATLAS_SOURCE_REVISION
      ?? sourceRevisionFromGit(appRoot, input.sourceRef)
      ?? unresolved('source_revision_dirty_or_untracked');
    const observedGraphRevision = input.graphRevision
      ?? options.graphRevision
      ?? process.env.ATLAS_GRAPH_REVISION
      ?? unresolved('graph_revision');
    const observedFeatureRevision = input.featureRevision
      ?? options.featureRevision
      ?? process.env.ATLAS_FEATURE_REVISION
      ?? unresolved('feature_revision');

    const gateInput = AgenticRepairEvidenceGateInputV1Schema.parse({
      schema: 'atlas.agentic-repair-evidence-gate-input.v1',
      requestId: input.requestId,
      queryText: input.queryText,
      targetFiles: input.targetFiles,
      workspaceRevision: observedWorkspaceRevision,
      sourceRevision: observedSourceRevision,
      graphRevision: observedGraphRevision,
      featureRevision: observedFeatureRevision,
      producerRevision,
      searchBudget: {
        maxGraphHops: 2,
        maxGraphFanout: 24,
        maxCandidates: 128,
        topK: 24,
        queryBatchSize: 1,
        latencyBudgetMs: 5000,
        contextTokenBudget: 12_000,
        exactPromotionTopK: 16,
      },
      contextBudget: {
        totalTokens: 12_000,
        reservedPromptTokens: 1600,
        reservedToolTokens: 1200,
        reservedOutputTokens: 2600,
        maxWindows: 12,
        maxWindowTokens: 1400,
        overlapTokens: 160,
        minExactEvidenceTokens: 1,
      },
      matrixDiagnostics: null,
      readinessPolicy: {
        minRequiredLibraryMeanPercent: 45,
        minOverallMeanPercent: 45,
        minDegradedOverallMeanPercent: 25,
        minSourceRefsPerRequiredLibrary: 1,
      },
    });
    const result = await buildAgenticRepairEvidenceGate(gateInput, executor);

    let semanticTournament: RepairSemanticTournamentReceiptV1 | null = null;
    let semanticPromotionFeedback: SemanticPromotionFeedbackResultV1 | null = null;
    let measuredMatrixDiagnostics: MeasuredMatrixDiagnosticsReceiptV1 | null = null;
    let measuredTangPolicy: MeasuredTangPolicyReceiptV1 | null = null;
    let matrixDiagnosticsError: string | null = null;
    if ((options.enableSemanticTournament ?? true) && result.readiness.gate === 'READY') {
      semanticTournament = await runCanonicalRepairSemanticTournament({
        requestId: input.requestId,
        queryText: input.queryText,
        candidates: result.candidates,
      }, {
        topK: options.semanticTournamentTopK ?? 8,
        maxCandidates: 64,
        oversampleFactor: 4,
        deadlineMs: 5000,
        runFullOracle: false,
        maxOracleCorpusRows: 2048,
        producerRevision: `${producerRevision}:semantic-tournament`,
      });
      semanticPromotionFeedback = rebuildRepairAfterSemanticPromotion(
        gateInput,
        result,
        semanticTournament,
        `${producerRevision}:semantic-promotion-feedback`,
      );

      // Promotion changes the N×16 matrix, so diagnostics must be measured on the
      // post-promotion bytes. The receipt checksum prevents stale SVD/rank data
      // from being paired with a different feature snapshot.
      try {
        measuredMatrixDiagnostics = measureSearchPolicyMatrixDiagnostics(
          semanticPromotionFeedback.featureMatrix,
          {
            requestId: input.requestId,
            producerRevision: `${producerRevision}:matrix-diagnostics`,
          },
        );
        measuredTangPolicy = buildMeasuredTangPolicyReceipt({
          requestId: input.requestId,
          matrix: semanticPromotionFeedback.featureMatrix,
          diagnostics: measuredMatrixDiagnostics,
          policy: {
            maxEffectiveRankRatio: 0.35,
            minRetainedEnergyPercent: 80,
            maxConditionNumber: 1_000_000,
            promotionCount: Math.min(
              gateInput.searchBudget.exactPromotionTopK,
              Math.max(1, semanticPromotionFeedback.featureMatrix.rows),
            ),
          },
          producerRevision: `${producerRevision}:tang-policy`,
        });
      } catch (error) {
        matrixDiagnosticsError = error instanceof Error ? error.message : String(error);
        measuredMatrixDiagnostics = null;
        measuredTangPolicy = null;
      }
    }

    // Re-resolve source lineage for exact-evidence packets at the final execution
    // gate. This deliberately does not trust candidate.sourceRevision alone: the
    // core evidence gate historically accepted a request-revision fallback during
    // candidate merge, and request constraints are not provenance observations.
    const exactEvidenceCandidates = result.candidates.filter((candidate) =>
      candidate.exactEvidence && candidate.packetKey != null,
    );
    const exactEvidenceResolutions = exactEvidenceCandidates.length
      ? await resolveSourceRevisionsFromPostgres(exactEvidenceCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          packetKey: candidate.packetKey,
          sourceRef: candidate.sourceRef,
        })))
      : [];
    const fullyRevisionAlignedExactEvidence = isResolvedRevision(observedSourceRevision)
      && exactEvidenceResolutions.some((resolution) =>
        (resolution.status === 'EXACT_PACKET_KEY' || resolution.status === 'UNIQUE_SOURCE_REF')
        && resolution.sourceRevision === observedSourceRevision,
      );
    const unresolvedRevisionFields = [
      ['workspaceRevision', observedWorkspaceRevision],
      ['sourceRevision', observedSourceRevision],
      ['graphRevision', observedGraphRevision],
      ['featureRevision', observedFeatureRevision],
    ].filter(([, value]) => !isResolvedRevision(value)).map(([name]) => name);

    // Semantic exact promotion can improve ranking/context selection, but it is
    // not byte/source exact evidence and cannot relax the canonical dry-run gate.
    const dryRunAllowed = result.readiness.gate === 'READY'
      && result.manifest.evidenceStatus === 'READY_FOR_DRY_RUN'
      && result.manifest.exactEvidencePacketKeys.length > 0
      && fullyRevisionAlignedExactEvidence;
    const reasonCodes = [
      ...(dryRunAllowed ? ['EVIDENCE_SUPPORTS_DRY_RUN'] : ['EVIDENCE_BLOCKS_DRY_RUN']),
      ...(result.readiness.gate === 'READY'
        ? ['REQUIRED_LIBRARY_READINESS_READY']
        : [`REQUIRED_LIBRARY_READINESS_${result.readiness.gate}`]),
      ...(fullyRevisionAlignedExactEvidence
        ? ['EXACT_EVIDENCE_CANONICAL_REVISION_PROOF_ALIGNED']
        : ['EXACT_EVIDENCE_CANONICAL_REVISION_PROOF_NOT_ALIGNED']),
      `EXACT_EVIDENCE_CANONICAL_REVISION_PROOFS:${exactEvidenceResolutions.length}`,
      ...(unresolvedRevisionFields.length
        ? [`UNRESOLVED_REVISIONS:${unresolvedRevisionFields.join(',')}`]
        : ['ALL_REQUEST_REVISIONS_RESOLVED']),
      ...(semanticTournament
        ? [`SEMANTIC_TOURNAMENT_${semanticTournament.status}:${semanticTournament.reason}`]
        : ['SEMANTIC_TOURNAMENT_NOT_RUN']),
      ...(semanticTournament?.status === 'EXECUTED'
        ? [`SEMANTIC_EXACT_PROMOTED_PACKETS:${semanticTournament.promotedPacketKeys.join(',')}`]
        : []),
      ...(semanticPromotionFeedback
        ? [`SEMANTIC_PROMOTION_FEEDBACK_${semanticPromotionFeedback.receipt.status}:${semanticPromotionFeedback.receipt.reason}`]
        : ['SEMANTIC_PROMOTION_FEEDBACK_NOT_RUN']),
      ...(semanticPromotionFeedback?.manifest.featureMatrix.changed
        ? ['SEMANTIC_PROMOTION_REBUILT_NX16_AND_CONTEXT']
        : []),
      ...(semanticPromotionFeedback?.manifest.matrixDiagnosticsInvalidatedByPromotion
        ? ['SEMANTIC_PROMOTION_INVALIDATED_STALE_MATRIX_DIAGNOSTICS']
        : []),
      ...(measuredMatrixDiagnostics
        ? [
            `POST_PROMOTION_NX16_DIAGNOSTICS_MEASURED:${measuredMatrixDiagnostics.numericalRank}/${measuredMatrixDiagnostics.columnCount}`,
            `POST_PROMOTION_NX16_EFFECTIVE_RANK:${measuredMatrixDiagnostics.effectiveRank ?? 'null'}`,
          ]
        : [`POST_PROMOTION_NX16_DIAGNOSTICS_UNAVAILABLE:${matrixDiagnosticsError ?? 'not-run'}`]),
      ...(measuredTangPolicy
        ? [
            `MEASURED_TANG_POLICY_${measuredTangPolicy.recommendation.status}`,
            `MEASURED_TANG_QUALIFIED:${measuredTangPolicy.qualified}`,
            ...measuredTangPolicy.qualificationReasonCodes,
          ]
        : ['MEASURED_TANG_POLICY_UNAVAILABLE']),
      'SOURCE_REVISION_FROM_CANONICAL_POSTGRES_METADATA',
      'REQUEST_REVISION_IS_CONSTRAINT_NOT_EVIDENCE_PROVENANCE',
      'CONTENT_HASH_NEVER_SUBSTITUTES_FOR_SOURCE_REVISION',
      'SEMANTIC_EXACT_DISTANCE_IS_OBSERVATION_NOT_SIMILARITY',
      'SEMANTIC_PROMOTION_DOES_NOT_CREATE_SOURCE_EXACT_EVIDENCE',
      'TANG_SELECTION_REMAINS_STOCHASTIC_EXECUTION_REQUIRED',
      'EVIDENCE_NEVER_AUTHORIZES_MUTATION',
    ];

    return {
      result,
      semanticTournament,
      semanticPromotionFeedback,
      measuredMatrixDiagnostics,
      measuredTangPolicy,
      lineage: {
        workspaceRevision: observedWorkspaceRevision,
        sourceRevision: observedSourceRevision,
        graphRevision: observedGraphRevision,
        featureRevision: observedFeatureRevision,
        fullyRevisionAlignedExactEvidence,
        unresolvedRevisionFields,
      },
      dryRunAllowed,
      applyAllowedByEvidence: false,
      reasonCodes,
    };
  }

  async function close(): Promise<void> {
    try { await transport?.close(); } finally {
      client = null;
      transport = null;
    }
  }

  return { evaluate, close, traceUrl: traceUrl.href };
}
