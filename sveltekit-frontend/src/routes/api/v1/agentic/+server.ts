import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { buildAgenticFixProposal } from '$lib/server/analysis/agentic-fix-proposal.js';
import { normalizeAgenticProposalTimelineRow } from '$lib/server/analysis/agentic-proposal-timeline.js';
import { db } from '$lib/server/db/client.js';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';
import { and, desc, eq, sql } from 'drizzle-orm';

const querySchema = z.object({
	action: z.enum(['status', 'recent-errors', 'fix-suggestions', 'fix-proposal', 'timeline']).default('status'),
	query: z.string().max(10_000).optional(),
	filePath: z.string().max(2000).optional(),
	clusterId: z.coerce.number().int().positive().optional(),
	featureId: z.string().max(500).optional(),
	feature_id: z.string().max(500).optional(),
	sourceRef: z.string().max(2000).optional(),
  source_ref: z.string().max(2000).optional(),
	workspaceTaskId: z.string().max(500).optional(),
	workspace_task_id: z.string().max(500).optional(),
	parentAtlasCardId: z.string().max(500).optional(),
	parent_atlas_card_id: z.string().max(500).optional(),
	tupleHash: z.string().max(500).optional(),
	semanticHash: z.string().max(500).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/v1/agentic — Agentic controller status, errors, and fix suggestions */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const { action, query: actionQuery } = parsed.success ? parsed.data : { action: 'status' as const, query: undefined };

	try {
		if (action === 'status') {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			const isConnected = redis.status === 'ready';

			return json({
				status: 'active',
				system: {
					redisConnected: isConnected,
					agenticControllerActive: true,
					watcherStatus: 'idle'
				},
				activity: {
					recentASTProcessing: 0,
					pendingErrors: 0,
					lastActivity: new Date().toISOString()
				}
			});
		}

		if (action === 'recent-errors') {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			const errorKeys = await redis.keys('agentic:error:*');
			const errors: Array<Record<string, unknown>> = [];

			if (errorKeys.length > 0) {
				const pipeline = redis.pipeline();
				for (const key of errorKeys.slice(0, 20)) {
					pipeline.get(key);
				}
				const results = await pipeline.exec();
				if (results) {
					for (const [err, val] of results as Array<[Error | null, string | null]>) {
						if (!err && val) {
							try {
								errors.push(JSON.parse(val));
							} catch {
								// skip
							}
						}
					}
				}
			}

			return json({ errors });
		}

		if (action === 'fix-suggestions') {
			const query = actionQuery ?? '';
      if (!query) {
        return json({ suggestions: [] });
      }
      const proposal = await buildAgenticFixProposal({
        query,
        filePath: parsed.success ? parsed.data.filePath : undefined,
        clusterId: parsed.success ? parsed.data.clusterId : undefined,
        featureId: parsed.success ? parsed.data.featureId : undefined,
        feature_id: parsed.success ? parsed.data.feature_id : undefined,
        sourceRef: parsed.success ? parsed.data.sourceRef : undefined,
        workspaceTaskId: parsed.success ? parsed.data.workspaceTaskId : undefined,
        workspace_task_id: parsed.success ? parsed.data.workspace_task_id : undefined,
        parentAtlasCardId: parsed.success ? parsed.data.parentAtlasCardId : undefined,
        parent_atlas_card_id: parsed.success ? parsed.data.parent_atlas_card_id : undefined,
        tupleHash: parsed.success ? parsed.data.tupleHash : undefined,
        semanticHash: parsed.success ? parsed.data.semanticHash : undefined,
      });
      return json({
        suggestions: proposal.suggestions,
        proposal: proposal.proposalMarkdown,
        proposalKind: proposal.proposalKind,
        laneOrder: proposal.laneOrder,
        observedStates: proposal.observedStates,
      });
		}

    if (action === 'fix-proposal') {
      const query = actionQuery ?? '';
      if (!query) {
        return json({ proposal: '', suggestions: [] });
      }
      const proposal = await buildAgenticFixProposal({
        query,
        filePath: parsed.success ? parsed.data.filePath : undefined,
        clusterId: parsed.success ? parsed.data.clusterId : undefined,
        featureId: parsed.success ? parsed.data.featureId : undefined,
        feature_id: parsed.success ? parsed.data.feature_id : undefined,
        sourceRef: parsed.success ? parsed.data.sourceRef : undefined,
        workspaceTaskId: parsed.success ? parsed.data.workspaceTaskId : undefined,
        workspace_task_id: parsed.success ? parsed.data.workspace_task_id : undefined,
        parentAtlasCardId: parsed.success ? parsed.data.parentAtlasCardId : undefined,
        parent_atlas_card_id: parsed.success ? parsed.data.parent_atlas_card_id : undefined,
        tupleHash: parsed.success ? parsed.data.tupleHash : undefined,
        semanticHash: parsed.success ? parsed.data.semanticHash : undefined,
      });
      return json({
        proposal: proposal.proposalMarkdown,
        suggestions: proposal.suggestions,
        proposalKind: proposal.proposalKind,
        laneOrder: proposal.laneOrder,
        observedStates: proposal.observedStates,
      });
		}

    if (action === 'timeline') {
      const query = actionQuery ?? '';
      const limit = parsed.success ? parsed.data.limit : 20;
      const filePath = parsed.success ? parsed.data.filePath : undefined;
      const clusterId = parsed.success ? parsed.data.clusterId : undefined;
      const featureId = parsed.success ? parsed.data.featureId ?? parsed.data.feature_id : undefined;
      const sourceRef = parsed.success ? parsed.data.sourceRef ?? parsed.data.source_ref : undefined;
      const workspaceTaskId = parsed.success ? parsed.data.workspaceTaskId ?? parsed.data.workspace_task_id : undefined;
      const parentAtlasCardId = parsed.success ? parsed.data.parentAtlasCardId ?? parsed.data.parent_atlas_card_id : undefined;
      const tupleHash = parsed.success ? parsed.data.tupleHash : undefined;
      const semanticHash = parsed.success ? parsed.data.semanticHash : undefined;
      const conditions = [
        eq(contextTimeline.eventType, 'agentic_proposal'),
        eq(contextTimeline.pipeline, 'agentic-fix-proposal'),
      ];
      if (filePath) {
        conditions.push(sql`${contextTimeline.payload}->>'filePath' = ${filePath}`);
      }
      if (clusterId) {
        conditions.push(sql`${contextTimeline.payload}->>'clusterId' = ${String(clusterId)}`);
      }
      if (featureId) {
        conditions.push(sql`(${contextTimeline.payload}->>'featureId' = ${featureId} OR ${contextTimeline.payload}->>'feature_id' = ${featureId})`);
      }
      if (sourceRef) {
        conditions.push(sql`(${contextTimeline.payload}->>'sourceRef' = ${sourceRef} OR ${contextTimeline.payload}->>'source_ref' = ${sourceRef})`);
      }
      if (workspaceTaskId) {
        conditions.push(sql`(${contextTimeline.payload}->>'workspaceTaskId' = ${workspaceTaskId} OR ${contextTimeline.payload}->>'workspace_task_id' = ${workspaceTaskId})`);
      }
      if (parentAtlasCardId) {
        conditions.push(sql`(${contextTimeline.payload}->>'parentAtlasCardId' = ${parentAtlasCardId} OR ${contextTimeline.payload}->>'parent_atlas_card_id' = ${parentAtlasCardId})`);
      }
      if (tupleHash) {
        conditions.push(sql`${contextTimeline.payload}->>'tupleHash' = ${tupleHash}`);
      }
      if (semanticHash) {
        conditions.push(sql`${contextTimeline.payload}->>'semanticHash' = ${semanticHash}`);
      }
      if (query) {
        conditions.push(sql`${contextTimeline.payload}->>'query' ILIKE ${`%${query}%`}`);
      }

      const rows = await db
        .select({
          id: contextTimeline.id,
          sessionId: contextTimeline.sessionId,
          eventType: contextTimeline.eventType,
          pipeline: contextTimeline.pipeline,
          summaryId: contextTimeline.summaryId,
          payload: contextTimeline.payload,
          createdAt: contextTimeline.createdAt,
        })
        .from(contextTimeline)
        .where(and(...conditions))
        .orderBy(desc(contextTimeline.createdAt))
        .limit(limit);

      return json({
        events: rows.map((row) =>
          normalizeAgenticProposalTimelineRow({
            id: row.id,
            sessionId: row.sessionId,
            eventType: row.eventType,
            pipeline: row.pipeline,
            summaryId: row.summaryId,
            payload: row.payload,
            createdAt: row.createdAt,
          }),
        ),
      });
    }

		return json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (err) {
		console.error('[/api/v1/agentic] error:', err);
		if (action === 'recent-errors') return json({ errors: [] });
    if (action === 'fix-suggestions') return json({ suggestions: [] });
    if (action === 'timeline') return json({ events: [] });
    return json({
      status: 'inactive',
      system: { redisConnected: false, agenticControllerActive: false, watcherStatus: 'idle' },
      activity: { recentASTProcessing: 0, pendingErrors: 0, lastActivity: null },
    });
	}
};
