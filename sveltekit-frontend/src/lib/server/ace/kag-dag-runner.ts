import { db } from '$lib/server/db/client';
import { eq, and } from 'drizzle-orm';
import { kagDagRuns, kagDagNodes, kagDagEdges } from '$lib/server/db/schema/kag-dag.js';

export type DagNodeName =
  | 'normalize_query'
  | 'extract_entities'
  | 'embed_query'
  | 'L1_redis_exact'
  | 'L1_5_redis_semantic'
  | 'L2_postgres_feature_index'
  | 'L2_5_postgres_documents_atlas'
  | 'L3_qdrant_semantic'
  | 'L4_graph_multihop'
  | 'L5_rg_ast_grep'
  | 'L6_raw_file_read'
  | 'gemma4_synthesis'
  | 'record_cache'
  | 'write_audit';

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
  run: (ctx: DagContext) => Promise<Partial<DagContext> | { skipped: boolean; reason: string }>;
};

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
    const executed = new Set<DagNodeName>();
    const startTime = Date.now();

    // Determine execution order (topological sort omitted for skeleton, running in hardcoded order)
    const executionPlan: DagNodeName[] = [
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
      'write_audit'
    ];

    // Persist edges for explainability
    for (const nodeName of executionPlan) {
      const node = this.nodes.get(nodeName);
      if (node && node.dependsOn.length > 0) {
        for (const dep of node.dependsOn) {
          try {
            await db.insert(kagDagEdges).values({
              runId,
              fromNodeKey: dep,
              toNodeKey: nodeName,
              edgeType: 'depends_on'
            });
          } catch {
            // ignore duplicates
          }
        }
      }
    }

    // Run nodes
    for (const nodeName of executionPlan) {
      const node = this.nodes.get(nodeName);
      if (!node) continue;

      // Cache short-circuit logic:
      if (ctx.cacheHit && nodeName !== 'write_audit' && nodeName !== 'record_cache') {
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
      executed.add(nodeName);
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

