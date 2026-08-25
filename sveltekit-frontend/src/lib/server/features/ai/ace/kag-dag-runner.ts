import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { eq, and } from 'drizzle-orm';
import { kagDagRuns, kagDagNodes, kagDagEdges } from '$lib/server/db/schema/kag-dag.js';

/**
 * Reference vocabulary for the ACE 6-stage/L1-L6 cache-hierarchy pipeline
 * (see root CLAUDE.md "ACP Memory Hierarchy"). Not enforced — DagNodeName is
 * `string` so callers with a different step vocabulary (e.g.
 * `semantic-search-workflow.ts`'s `build_agentic_rag_context` /
 * `canonical_search` / `rust_shadow_compare` / `validate_response`) can
 * register/persist nodes without fighting a closed union.
 */
export const KNOWN_DAG_NODE_NAMES = [
  'normalize_query',
  'extract_entities',
  'embed_query',
  'L1_redis_exact',
  'L1_5_redis_semantic',
  'L2_postgres_feature_index',
  'L2_5_postgres_documents_atlas',
  'L3_qdrant_semantic',
  'L4_graph_multihop',
  'L5_rg_ast_grep',
  'L6_raw_file_read',
  'gemma4_synthesis',
  'record_cache',
  'write_audit',
] as const;

export type DagNodeName = string;

export type DagContext = {
  runId: string;
  query: string;
  normalizedQuery?: string;
  entities?: string[];
  queryEmbedding?: number[];
  cacheHit?: boolean;
  centroids?: any[];
  chunks?: any[];
  graphNeighbors?: any[];
  agentsContext?: any[];
  summaries?: any[];
  finalAnswer?: string;
};

export type DagNode = {
  name: DagNodeName;
  dependsOn: DagNodeName[];
  /**
   * When true, this node always runs even on a cache hit (e.g. audit
   * writers, cache recorders). Replaces the runner's former hardcoded
   * name checks (`nodeName !== 'write_audit' && nodeName !== 'record_cache'`)
   * so the short-circuit rule travels with the node registration instead of
   * being baked into the orchestrator by magic string.
   */
  alwaysRun?: boolean;
  run: (ctx: DagContext) => Promise<Partial<DagContext> | { skipped: boolean; reason: string }>;
};

/**
 * Deterministic topological order (Kahn's algorithm) over the registered
 * nodes, using only `dependsOn` edges whose target is itself a registered
 * node — an edge referencing an unregistered dependency is dropped (that
 * dependency can never run, so it cannot gate anything) rather than
 * silently deadlocking the whole run. Ties break on insertion order for
 * reproducibility. Throws on a real cycle.
 */
export function topologicalSortDagNodes(nodes: ReadonlyMap<string, DagNode>): DagNodeName[] {
  const registered = new Set(nodes.keys());
  const insertionOrder = [...nodes.keys()];
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const name of insertionOrder) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }
  for (const [name, node] of nodes) {
    const deps = node.dependsOn.filter((dep) => registered.has(dep));
    inDegree.set(name, deps.length);
    for (const dep of deps) {
      dependents.get(dep)!.push(name);
    }
  }

  const ready = insertionOrder.filter((name) => inDegree.get(name) === 0);
  const order: DagNodeName[] = [];
  while (ready.length > 0) {
    // Stable: always take the earliest-inserted ready node.
    ready.sort((a, b) => insertionOrder.indexOf(a) - insertionOrder.indexOf(b));
    const name = ready.shift()!;
    order.push(name);
    for (const dependent of dependents.get(name) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (order.length !== insertionOrder.length) {
    const unresolved = insertionOrder.filter((name) => !order.includes(name));
    throw new Error(`KagDagRunner: cyclic dependsOn among registered nodes: ${unresolved.join(', ')}`);
  }

  return order;
}

export class KagDagRunner {
  private nodes = new Map<DagNodeName, DagNode>();

  register(node: DagNode) {
    this.nodes.set(node.name, node);
  }

  async execute(query: string, queryHash: string): Promise<DagContext> {
    const runId = crypto.randomUUID();

    // 1. Initialize Run
    await db.insert(kagDagRuns).values({
      id: runId,
      query,
      queryHash,
      status: 'running',
    });

    const ctx: DagContext = { runId, query };
    const startTime = Date.now();

    const executionPlan = topologicalSortDagNodes(this.nodes);

    // Persist edges for explainability (only between two registered nodes).
    for (const nodeName of executionPlan) {
      const node = this.nodes.get(nodeName);
      if (node && node.dependsOn.length > 0) {
        for (const dep of node.dependsOn) {
          if (!this.nodes.has(dep)) continue;
          try {
            await db.insert(kagDagEdges).values({
              runId,
              fromNodeKey: dep,
              toNodeKey: nodeName,
              edgeType: 'depends_on',
            });
          } catch {
            // ignore duplicates
          }
        }
      }
    }

    // Run nodes in topological order
    for (const nodeName of executionPlan) {
      const node = this.nodes.get(nodeName);
      if (!node) continue;

      // Cache short-circuit logic: skip non-`alwaysRun` nodes once a cache hit is recorded.
      if (ctx.cacheHit && !node.alwaysRun) {
        await this.logNodeStart(runId, nodeName);
        await this.logNodeFinish(runId, nodeName, { skipped: true, reason: 'prior-answer-cache-hit' }, 0, true);
        continue;
      }

      const nodeStart = Date.now();
      await this.logNodeStart(runId, nodeName);

      try {
        const result = await node.run(ctx);
        const duration = Date.now() - nodeStart;

        if ('skipped' in result && result.skipped) {
          await this.logNodeFinish(runId, nodeName, result, duration, true);
        } else {
          Object.assign(ctx, result);
          await this.logNodeFinish(runId, nodeName, result, duration, false);
        }
      } catch (err: any) {
        const duration = Date.now() - nodeStart;
        await this.logNodeError(runId, nodeName, err, duration);
        // Fail the run
        await db.update(kagDagRuns).set({
          status: 'failed',
          finishedAt: new Date(),
          totalDurationMs: Date.now() - startTime
        }).where(eq(kagDagRuns.id, runId));
        throw err;
      }
    }

    // Complete run
    await db.update(kagDagRuns).set({
      status: 'success',
      finalAnswer: ctx.finalAnswer,
      finishedAt: new Date(),
      totalDurationMs: Date.now() - startTime
    }).where(eq(kagDagRuns.id, runId));

    return ctx;
  }

  private async logNodeStart(runId: string, nodeName: string) {
    try {
      await db.insert(kagDagNodes).values({
        runId,
        nodeKey: nodeName,
        nodeType: nodeName,
        status: 'running',
      });
    } catch {}
  }

  private async logNodeFinish(runId: string, nodeName: string, output: any, durationMs: number, cacheHit: boolean) {
    try {
      await db.update(kagDagNodes).set({
        status: 'success',
        output,
        durationMs,
        cacheHit,
        finishedAt: new Date()
      }).where(and(eq(kagDagNodes.runId, runId), eq(kagDagNodes.nodeKey, nodeName)));
    } catch {}
  }

  private async logNodeError(runId: string, nodeName: string, error: Error, durationMs: number) {
    try {
      await db.update(kagDagNodes).set({
        status: 'error',
        error: { message: error.message, stack: error.stack },
        durationMs,
        finishedAt: new Date()
      }).where(and(eq(kagDagNodes.runId, runId), eq(kagDagNodes.nodeKey, nodeName)));
    } catch {}
  }
}

export function makeKagDagQueryHash(query: string): string {
  return createHash('sha256').update(query).digest('hex').slice(0, 16);
}

/**
 * Pure input shape for `persistKagDagRunFromSteps` — deliberately narrower
 * than `SemanticSearchWorkflowResult` (no import from
 * `semantic-search-workflow.ts` here, to avoid a circular/coupling
 * dependency; that file passes its own `workflowDag`/`workflowState` shape,
 * which already satisfies this).
 */
export interface KagDagStepV1 {
  name: string;
  status: 'completed' | 'skipped' | 'failed';
  durationMs: number;
  detail?: string;
}

export interface PersistKagDagRunInputV1 {
  query: string;
  workflowState: string;
  steps: readonly KagDagStepV1[];
  /** Arbitrary durable summary (topPacketKeys, workflowState, etc.) — stored in `kag_dag_runs.final_json`. */
  finalJson?: Record<string, unknown>;
  queryHash?: string;
}

const STEP_STATUS_TO_NODE_STATUS: Record<KagDagStepV1['status'], string> = {
  completed: 'success',
  skipped: 'skipped',
  failed: 'error',
};

/**
 * Durable Postgres audit-trail sidecar for an already-executed workflow
 * step sequence (e.g. `SemanticSearchWorkflowResult.workflowDag`). This is
 * NOT a second orchestrator — it never runs anything, it only records what
 * already ran, closing the "provisioned tables (`kag_dag_runs`/
 * `kag_dag_nodes`/`kag_dag_edges`), zero live writer" gap found in the
 * 2026-08-26 audit (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
 * `KagDagRunner` above remains the orchestrator for callers that actually
 * want DAG-node execution (register + execute); this function is for
 * callers that already have a linear step trace and just need it persisted.
 *
 * Fail-open by construction: any DB error is caught and logged, never
 * thrown — callers should invoke this fire-and-forget, matching the
 * existing convention (`recordPromotionIntent`, `logExposureEvents` in
 * `search-runtime.ts`).
 */
export async function persistKagDagRunFromSteps(
  input: PersistKagDagRunInputV1,
): Promise<{ runId: string } | null> {
  const runId = crypto.randomUUID();
  const queryHash = input.queryHash ?? makeKagDagQueryHash(input.query);
  const totalDurationMs = input.steps.reduce((sum, step) => sum + step.durationMs, 0);
  const status = input.steps.some((step) => step.status === 'failed') ? 'failed' : 'success';

  try {
    await db.insert(kagDagRuns).values({
      id: runId,
      query: input.query,
      queryHash,
      status,
      totalDurationMs,
      finalJson: { workflowState: input.workflowState, ...(input.finalJson ?? {}) },
      finishedAt: new Date(),
    });

    for (const [index, step] of input.steps.entries()) {
      await db.insert(kagDagNodes).values({
        runId,
        nodeKey: step.name,
        nodeType: step.name,
        status: STEP_STATUS_TO_NODE_STATUS[step.status],
        durationMs: step.durationMs,
        cacheHit: step.status === 'skipped',
        output: step.detail ? { detail: step.detail } : {},
        finishedAt: new Date(),
      });

      const previous = input.steps[index - 1];
      if (previous) {
        try {
          await db.insert(kagDagEdges).values({
            runId,
            fromNodeKey: previous.name,
            toNodeKey: step.name,
            edgeType: 'depends_on',
          });
        } catch {
          // ignore duplicates
        }
      }
    }

    return { runId };
  } catch (error) {
    console.warn('[kag-dag-runner] persistKagDagRunFromSteps failed (non-blocking):', error);
    return null;
  }
}
