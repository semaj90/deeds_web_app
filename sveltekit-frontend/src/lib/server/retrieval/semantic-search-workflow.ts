import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { buildStreamPreamble } from '$lib/server/mcp/atlas-tools-client.js';
import { createAtlasSearchAdapter } from '$lib/server/atlas/retrieval/search-runtime-adapter.js';
import { searchResultToHyperRagResult } from './canonical-hyperrag-adapter.js';
import { embedQueryForLane } from './embedding-service.js';
import { SearchMetadataFilterSchema } from './search-contract.js';
import { RustNapiSearchBackend } from '$lib/server/search/rust-napi-search-backend.js';
import { persistKagDagRunFromSteps } from '$lib/server/features/ai/ace/kag-dag-runner.js';

const SearchShadowSchema = z.object({
  enabled: z.boolean(),
  backend: z.literal('rust_napi'),
  indexVersion: z.string().nullable(),
  overlapCount: z.number().int().nonnegative(),
  overlapRatio: z.number().min(0).max(1),
  topPacketKeys: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
});

const WorkflowStepSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['completed', 'skipped', 'failed']),
  durationMs: z.number().int().nonnegative(),
  detail: z.string().optional(),
});

const WorkflowReportDagNodeSchema = z.object({
  stage: z.string().min(1),
  state: z.string().min(1),
  status: z.string().min(1),
  dependsOn: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  outputRef: z.string().nullable(),
  updated_at: z.string().min(1),
  notes: z.string().nullable(),
});

const SemanticSearchWorkflowReportSchema = z.object({
  generated_at: z.string().datetime(),
  workflow_state: z.string().min(1),
  query: z.string().min(1),
  top_k: z.number().int().positive(),
  dag: z.array(WorkflowReportDagNodeSchema),
  top_packet_keys: z.array(z.string().min(1)),
  preamble: z.record(z.string(), z.unknown()).nullable(),
  ace: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
  shadow: SearchShadowSchema.nullable(),
}).passthrough();

export const SemanticSearchWorkflowRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(16_000),
    topK: z.number().int().min(1).max(100).default(20),
    userId: z.string().min(1).optional(),
    caseId: z.string().min(1).optional(),
    traceId: z.string().min(1).optional(),
    withGraphExpansion: z.boolean().default(true),
    includeWorkflowPreamble: z.boolean().default(false),
    includeAcePacket: z.boolean().default(true),
    compareRustShadow: z.boolean().default(false),
    persistReport: z.boolean().default(false),
    shadowTopK: z.number().int().min(1).max(50).default(20),
    filters: SearchMetadataFilterSchema.default({
      includeGenerated: false,
      includeLegacy: false,
    } as z.infer<typeof SearchMetadataFilterSchema>),
    spanContext: z
      .object({
        traceId: z.string().min(1).optional(),
        parentSpanId: z.string().min(1).optional(),
      })
      .optional(),
  })
  .strict();

export type SemanticSearchWorkflowRequest = z.infer<typeof SemanticSearchWorkflowRequestSchema>;

export const SemanticSearchWorkflowResultSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive(),
  workflowState: z.enum(['DISCOVER', 'RAG', 'RETRIEVE', 'EXPAND', 'SHADOW_COMPARE', 'VALIDATE', 'COMPLETE', 'FAILED']),
  workflowDag: z.array(WorkflowStepSchema),
  preamble: z
    .object({
      intent: z.unknown(),
      rag: z.unknown(),
    })
    .nullable(),
  topPacketKeys: z.array(z.string().min(1)),
  packets: z.array(z.record(z.string(), z.unknown())),
  metadata: z.record(z.string(), z.unknown()),
  provenance: z.record(z.string(), z.unknown()),
  ace: z.record(z.string(), z.unknown()).nullable(),
  graphExpanded: z.array(z.record(z.string(), z.unknown())).optional(),
  shadow: SearchShadowSchema.nullable(),
  error: z.string().nullable().optional(),
});

export type SemanticSearchWorkflowResult = z.infer<typeof SemanticSearchWorkflowResultSchema>;

function workflowReportPaths(): string[] {
  return [
    path.join('docs', 'reports', 'semantic-search-workflow.json'),
    path.join('docs', 'reports', 'atlas', 'semantic-search-workflow.json'),
  ];
}

function toWorkflowReportDagNodes(
  workflowDag: SemanticSearchWorkflowResult['workflowDag'],
  generatedAt: string,
): z.infer<typeof WorkflowReportDagNodeSchema>[] {
  return workflowDag.map((step, index) => ({
    stage: step.name,
    state: step.status.toUpperCase(),
    status: step.status,
    dependsOn: index > 0 ? [workflowDag[index - 1].name] : [],
    evidenceRefs: [],
    outputRef: null,
    updated_at: generatedAt,
    notes: step.detail ?? null,
  }));
}

async function writeJsonReport(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function persistSemanticSearchWorkflowReport(
  result: SemanticSearchWorkflowResult,
): Promise<void> {
  const generatedAt = new Date().toISOString();
  const report = SemanticSearchWorkflowReportSchema.parse({
    generated_at: generatedAt,
    workflow_state: result.workflowState,
    query: result.query,
    top_k: result.topK,
    dag: toWorkflowReportDagNodes(result.workflowDag, generatedAt),
    top_packet_keys: result.topPacketKeys,
    preamble: result.preamble,
    ace: result.ace,
    metadata: result.metadata,
    provenance: result.provenance,
    shadow: result.shadow,
  });

  for (const reportPath of workflowReportPaths()) {
    await writeJsonReport(reportPath, report);
  }
}

export async function runSemanticSearchWorkflow(
  request: SemanticSearchWorkflowRequest,
  runtimeOptions?: {
    userId?: string | null;
    caseId?: string | null;
  },
): Promise<SemanticSearchWorkflowResult> {
  const validated = SemanticSearchWorkflowRequestSchema.parse(request);
  const steps: Array<z.infer<typeof WorkflowStepSchema>> = [];
  const query = validated.query.trim();

  const addStep = (name: string, status: 'completed' | 'skipped' | 'failed', startedAt: number, detail?: string) => {
    steps.push({
      name,
      status,
      durationMs: Math.max(0, Date.now() - startedAt),
      ...(detail ? { detail } : {}),
    });
  };

  const searchRequest = {
    query,
    topK: validated.topK,
    userId: validated.userId ?? runtimeOptions?.userId ?? undefined,
    caseId: validated.caseId ?? runtimeOptions?.caseId ?? undefined,
    filters: validated.filters,
    withGraphExpansion: validated.withGraphExpansion,
    traceId: validated.traceId ?? validated.spanContext?.traceId ?? undefined,
  };

  const preambleStarted = Date.now();
  let preamble: SemanticSearchWorkflowResult['preamble'] = null;
  if (validated.includeWorkflowPreamble) {
    try {
      preamble = await buildStreamPreamble(query, Math.min(validated.topK, 12));
      addStep('build_agentic_rag_context', 'completed', preambleStarted);
    } catch (err) {
      addStep('build_agentic_rag_context', 'failed', preambleStarted, (err as Error).message);
    }
  } else {
    addStep('build_agentic_rag_context', 'skipped', preambleStarted, 'workflow preamble disabled');
  }

  const searchStarted = Date.now();
  const adapter = createAtlasSearchAdapter({
    userId: searchRequest.userId,
    caseId: searchRequest.caseId,
  });
  const adapterResult = await adapter.search({
    query: searchRequest.query,
    topK: searchRequest.topK,
    userId: searchRequest.userId,
    caseId: searchRequest.caseId,
    filters: searchRequest.filters,
    traceId: searchRequest.traceId,
    withGraphExpansion: searchRequest.withGraphExpansion,
  });
  addStep('canonical_search', 'completed', searchStarted);

  const ace = validated.includeAcePacket
    ? searchResultToHyperRagResult(
        {
          packets: adapterResult.packets,
          metadata: adapterResult.metadata,
          provenance: adapterResult.provenance,
        } as unknown as Parameters<typeof searchResultToHyperRagResult>[0],
        { query },
      )
    : null;

  const topPacketKeys = adapterResult.topPacketKeys;

  let shadow: SemanticSearchWorkflowResult['shadow'] = null;
  if (validated.compareRustShadow) {
    const shadowStarted = Date.now();
    try {
      const manifestPath = process.env.RUST_ANN_MANIFEST ?? 'artifacts/rust-ann-slot-manifest.json';
      if (!existsSync(path.resolve(manifestPath))) {
        addStep('rust_shadow_compare', 'skipped', shadowStarted, `manifest not found: ${manifestPath}`);
      } else {
        const backend = new RustNapiSearchBackend(manifestPath);
        const embedding = await embedQueryForLane(query, 'dense_768');
        const result = await backend.search({
          queryVector: embedding.vector,
          vectorName: 'dense_768',
          limit: Math.min(validated.shadowTopK, validated.topK),
          candidateMultiplier: 1,
          includePayload: true,
          filter: validated.filters,
        });
        const rustTopKeys = result.candidates
          .map((candidate) => candidate.packetKey)
          .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
          .slice(0, validated.shadowTopK);
        const overlap = rustTopKeys.filter((key) => topPacketKeys.includes(key));
        shadow = {
          enabled: true,
          backend: 'rust_napi',
          indexVersion: result.indexVersion,
          overlapCount: overlap.length,
          overlapRatio: rustTopKeys.length > 0 ? overlap.length / rustTopKeys.length : 0,
          topPacketKeys: rustTopKeys,
          warnings: result.warnings,
        };
        addStep('rust_shadow_compare', 'completed', shadowStarted, `overlap=${overlap.length}/${rustTopKeys.length || 0}`);
      }
    } catch (err) {
      addStep('rust_shadow_compare', 'failed', shadowStarted, (err as Error).message);
      shadow = null;
    }
  } else {
    addStep('rust_shadow_compare', 'skipped', Date.now(), 'shadow comparison disabled');
  }

  const validateStarted = Date.now();
  const workflowState = 'COMPLETE' as const;
  addStep('validate_response', 'completed', validateStarted);
  const workflowDag = [
    { name: 'validate_request', status: 'completed' as const, durationMs: 0 },
    ...steps,
  ];

  const result = SemanticSearchWorkflowResultSchema.parse({
    query,
    topK: validated.topK,
    workflowState,
    workflowDag,
    preamble,
    topPacketKeys,
    packets: adapterResult.packets as Array<Record<string, unknown>>,
    metadata: adapterResult.metadata as Record<string, unknown>,
    provenance: adapterResult.provenance as Record<string, unknown>,
    ace,
    ...(adapterResult.graphExpanded ? { graphExpanded: adapterResult.graphExpanded as unknown as Array<Record<string, unknown>> } : {}),
    shadow,
  });

  if (validated.persistReport) {
    try {
      await persistSemanticSearchWorkflowReport(result);
    } catch {
      // Report persistence is opt-in and must not fail the live search path.
    }
  }

  // Durable Postgres audit trail (kag_dag_runs/kag_dag_nodes/kag_dag_edges) —
  // unlike the JSON report above, this is always-on (not gated behind
  // persistReport): it closes the "provisioned tables, zero live writer"
  // gap found in the 2026-08-26 audit
  // (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
  // Fire-and-forget: persistKagDagRunFromSteps() fails open internally and
  // must never block or fail the live search response.
  void persistKagDagRunFromSteps({
    query,
    workflowState: result.workflowState,
    steps: workflowDag,
    finalJson: { topPacketKeys: result.topPacketKeys, topK: result.topK },
  }).catch((error) => {
    console.warn('[semantic-search-workflow] kag_dag audit persistence failed (non-blocking):', error);
  });

  return result;
}
