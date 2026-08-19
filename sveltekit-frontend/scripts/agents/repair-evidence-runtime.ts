import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  buildAgenticRepairEvidenceGate,
  type AgenticRepairEvidenceGateResultV1,
} from '../../src/lib/server/atlas/ranking/agentic-repair-evidence-gate.js';
import { createTraceRepairEvidenceExecutor } from '../../src/lib/server/atlas/ranking/trace-repair-evidence-adapter.js';

export type RepairEvidenceRuntimeOptions = {
  appRoot: string;
  traceMcpUrl?: string;
  graphRevision?: string | null;
  featureRevision?: string | null;
  producerRevision?: string;
};

export type RepairEvidenceEvaluation = {
  result: AgenticRepairEvidenceGateResultV1;
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

function sha256File(filePath: string): string | null {
  try {
    const data = fs.readFileSync(filePath);
    return `sha256:${createHash('sha256').update(data).digest('hex')}`;
  } catch {
    return null;
  }
}

function workspaceRevision(appRoot: string): string | null {
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

export function createRepairEvidenceRuntime(options: RepairEvidenceRuntimeOptions) {
  const appRoot = path.resolve(options.appRoot);
  const producerRevision = options.producerRevision ?? 'repair-evidence-runtime.v1';
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
        { name: 'parent-atlas-repair-evidence', version: '1.0.0' },
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

  const executor = createTraceRepairEvidenceExecutor(async (name, args) => {
    const active = await ensureClient();
    const result = await active.callTool({ name, arguments: args });
    return extractTextContent(result);
  });

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
      ?? workspaceRevision(appRoot)
      ?? unresolved('workspace_revision');
    const observedSourceRevision = input.sourceRevision
      ?? process.env.ATLAS_SOURCE_REVISION
      ?? sha256File(sourcePath(appRoot, input.sourceRef))
      ?? unresolved('source_revision');
    const observedGraphRevision = input.graphRevision
      ?? options.graphRevision
      ?? process.env.ATLAS_GRAPH_REVISION
      ?? unresolved('graph_revision');
    const observedFeatureRevision = input.featureRevision
      ?? options.featureRevision
      ?? process.env.ATLAS_FEATURE_REVISION
      ?? unresolved('feature_revision');

    const result = await buildAgenticRepairEvidenceGate({
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
    }, executor);

    // Strict lineage gate: exact byte/SHA evidence is necessary but not enough.
    // At least one exact candidate must carry the same observed source revision.
    // atlas.packet_search does not currently emit source_revision, so this stays
    // false until the canonical owner is upgraded instead of copying the request
    // revision onto the hit and pretending it was observed.
    const fullyRevisionAlignedExactEvidence = result.candidates.some((candidate) =>
      candidate.exactEvidence
      && candidate.packetKey != null
      && candidate.sourceRevision != null
      && candidate.sourceRevision === observedSourceRevision,
    );
    const unresolvedRevisionFields = [
      ['workspaceRevision', observedWorkspaceRevision],
      ['sourceRevision', observedSourceRevision],
      ['graphRevision', observedGraphRevision],
      ['featureRevision', observedFeatureRevision],
    ].filter(([, value]) => !isResolvedRevision(value)).map(([name]) => name);

    const dryRunAllowed = result.manifest.evidenceStatus !== 'BLOCKED'
      && result.manifest.exactEvidencePacketKeys.length > 0;
    const reasonCodes = [
      ...(dryRunAllowed ? ['EVIDENCE_SUPPORTS_DRY_RUN'] : ['EVIDENCE_BLOCKS_DRY_RUN']),
      ...(fullyRevisionAlignedExactEvidence
        ? ['EXACT_EVIDENCE_REVISION_ALIGNED']
        : ['EXACT_EVIDENCE_REVISION_ALIGNMENT_NOT_PROVEN']),
      ...(unresolvedRevisionFields.length
        ? [`UNRESOLVED_REVISIONS:${unresolvedRevisionFields.join(',')}`]
        : ['ALL_REQUEST_REVISIONS_RESOLVED']),
      'EVIDENCE_NEVER_AUTHORIZES_MUTATION',
    ];

    return {
      result,
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
