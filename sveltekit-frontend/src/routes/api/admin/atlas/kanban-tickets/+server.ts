import { createHash } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	blockKanbanTask,
	claimKanbanTask,
	completeKanbanTask,
	createKanbanTask,
	heartbeatKanbanTask,
	KanbanTaskLaneSchema,
	KanbanTaskStatusSchema,
	listKanbanTaskEvents,
	listKanbanTasks,
	reclaimStaleKanbanTask,
	retryKanbanTask,
} from '$lib/server/atlas/kanban-task-board.js';
import {
	projectRecommendationToKanbanV1,
	recordReviewDecisionV1,
} from '$lib/server/atlas/recommendations/human-review-projection-v1.js';

const CreateTicketActionSchema = z.object({
	action: z.literal('create_ticket'),
	taskId: z.string().min(1).optional(),
	featureId: z.string().min(1),
	featureLabel: z.string().min(1),
	summary: z.string().min(1).optional(),
	priority: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
	sourceRefs: z.array(z.string().min(1)).min(1),
	acceptanceCriteria: z.array(z.string().min(1)).min(1).default(['Pass targeted validation command']),
	validationCommand: z.string().min(1),
	permissionMode: z.enum(['read_only', 'proposal_only', 'patch_allowed']).default('proposal_only'),
	workspaceRevision: z.string().min(1).nullable().optional(),
	graphifyRevision: z.string().min(1).default('graphify:pending-revision'),
	featureRevision: z.string().min(1).default('feature:pending-revision'),
});

const ClaimTicketActionSchema = z.object({
	action: z.literal('claim'),
	taskId: z.string().min(1),
	workerId: z.string().min(1).default('operator-control-panel'),
	runId: z.string().min(1).optional(),
	validationCommand: z.string().min(1).optional(),
});

const HeartbeatTicketActionSchema = z.object({
	action: z.literal('heartbeat'),
	taskId: z.string().min(1),
	claimToken: z.string().min(1),
	runId: z.string().min(1),
	note: z.string().min(1).optional(),
});

const CompleteTicketActionSchema = z.object({
	action: z.literal('complete'),
	taskId: z.string().min(1),
	workerId: z.string().min(1).default('operator-control-panel'),
	runId: z.string().min(1).optional(),
	validationCommand: z.string().min(1).optional(),
});

const BlockTicketActionSchema = z.object({
	action: z.literal('block'),
	taskId: z.string().min(1),
	reason: z.string().min(1).optional(),
});

const RetryTicketActionSchema = z.object({
	action: z.literal('retry'),
	taskId: z.string().min(1),
	reason: z.string().min(1).optional(),
});

const ReclaimTicketActionSchema = z.object({
	action: z.literal('reclaim_stale'),
	taskId: z.string().min(1),
});

const ReviewRecommendationActionSchema = z.object({
	action: z.literal('review_decision'),
	recommendation: z.record(z.string(), z.unknown()),
	decision: z.enum(['approve', 'reject', 'request_changes']),
	reviewerId: z.string().min(1).default('admin-operator'),
	notes: z.string().optional(),
});

const AgentDispatchActionSchema = z.object({
	action: z.literal('agent_dispatch'),
	taskId: z.string().min(1),
	agentId: z.string().min(1).default('hermes-agent-v1'),
	taskGoal: z.string().min(1).optional(),
});

const KanbanTicketsPostPayloadSchema = z.discriminatedUnion('action', [
	CreateTicketActionSchema,
	ClaimTicketActionSchema,
	HeartbeatTicketActionSchema,
	CompleteTicketActionSchema,
	BlockTicketActionSchema,
	RetryTicketActionSchema,
	ReclaimTicketActionSchema,
	ReviewRecommendationActionSchema,
	AgentDispatchActionSchema,
]);

function mapPriorityToInteger(priority: 'low' | 'medium' | 'high' | 'critical'): number {
	switch (priority) {
		case 'critical':
			return 95;
		case 'high':
			return 75;
		case 'medium':
			return 50;
		case 'low':
			return 25;
	}
}

export const GET: RequestHandler = async ({ url, locals }) => {
	const stableEmpty = {
		ok: false,
		tasks: [] as unknown[],
		total: 0,
		events: [] as unknown[],
		canonicalAuthority: false as const,
		error: null as string | null,
	};

	if (locals.user?.role !== 'admin') {
		return json({ ...stableEmpty, error: 'ADMIN_ONLY' }, { status: 403 });
	}

	try {
		const rawLane = url.searchParams.get('lane') ?? undefined;
		const rawStatus = url.searchParams.get('status') ?? undefined;
		const rawLimit = Number(url.searchParams.get('limit') ?? '50');
		const lane = rawLane ? KanbanTaskLaneSchema.parse(rawLane) : undefined;
		const status = rawStatus ? KanbanTaskStatusSchema.parse(rawStatus) : undefined;
		const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50;

		const [board, recentEvents] = await Promise.all([
			listKanbanTasks({ lane, status, limit }),
			listKanbanTaskEvents({ limit: 25 }),
		]);

		return json({
			ok: true,
			tasks: board.tasks,
			total: board.total,
			events: recentEvents,
			canonicalAuthority: false as const,
			error: null,
		});
	} catch (error) {
		return json(
			{
				...stableEmpty,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 200 },
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin') {
		return json(
			{
				ok: false,
				action: null,
				task: null,
				recommendationProjection: null,
				reviewEvent: null,
				canonicalAuthority: false as const,
				error: 'ADMIN_ONLY',
			},
			{ status: 403 },
		);
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json(
			{
				ok: false,
				action: null,
				task: null,
				recommendationProjection: null,
				reviewEvent: null,
				canonicalAuthority: false as const,
				error: 'INVALID_JSON_PAYLOAD',
			},
			{ status: 400 },
		);
	}

	const parsed = KanbanTicketsPostPayloadSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{
				ok: false,
				action: null,
				task: null,
				recommendationProjection: null,
				reviewEvent: null,
				canonicalAuthority: false as const,
				error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
			},
			{ status: 400 },
		);
	}

	const data = parsed.data;
	try {
		switch (data.action) {
			case 'create_ticket': {
				const digest = createHash('sha256')
					.update(`${data.featureId}:${data.featureLabel}:${data.sourceRefs.join(',')}`)
					.digest('hex')
					.slice(0, 12);
				const taskId = data.taskId ?? `ticket-${digest}`;
				const recommendationId = `rec-${digest}`;

				// 1. Project through human-review-projection-v1 (never auto-patches; sets proposed/review_required)
				const recommendationProjection = projectRecommendationToKanbanV1({
					recommendationId,
					title: data.featureLabel,
					summary: data.summary ?? `${data.featureLabel} (${data.featureId})`,
					priority: data.priority,
					targetFiles: data.sourceRefs,
					evidenceRefs: data.sourceRefs,
					acceptanceCriteria: data.acceptanceCriteria,
					validationCommands: [data.validationCommand],
					permissionMode: data.permissionMode,
					promotionGate: {
						recommendation_id: recommendationId,
						retrieval_confidence: 0.9,
						evidence_completeness: 0.85,
						duplicate_task_probability: 0.05,
						actionable: true,
						affected_paths_known: data.sourceRefs.length > 0,
						acceptance_criteria_present: data.acceptanceCriteria.length > 0,
						permissions_resolved: data.permissionMode !== 'patch_allowed',
						permission_mode: data.permissionMode,
						gate_decision: data.permissionMode === 'patch_allowed' ? 'REVIEW_REQUIRED' : 'PROMOTE',
						failure_reasons: [],
					},
					graphifyRevision: data.graphifyRevision,
					featureRevision: data.featureRevision,
				});

				// 2. Persist ticket + revision-linked event via Drizzle kanban-task-board
				const task = await createKanbanTask({
					taskId,
					featureId: data.featureId,
					featureLabel: data.featureLabel,
					sourceRefs: data.sourceRefs,
					lane: 'todo',
					priority: mapPriorityToInteger(data.priority),
					validationCommand: data.validationCommand,
					idempotencyKey: `idem:${taskId}`,
					workspaceRevision: data.workspaceRevision ?? null,
					graphifyRevision: data.graphifyRevision,
					featureRevision: data.featureRevision,
					permissionMode: data.permissionMode,
				});

				return json({
					ok: true,
					action: data.action,
					task,
					recommendationProjection,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'claim': {
				const claimed = await claimKanbanTask({
					taskId: data.taskId,
					workerId: data.workerId,
					runId: data.runId,
					validationCommand: data.validationCommand,
				});
				return json({
					ok: true,
					action: data.action,
					task: claimed.task,
					claimToken: claimed.claimToken,
					runId: claimed.runId,
					claimExpiresAt: claimed.claimExpiresAt,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'heartbeat': {
				const hb = await heartbeatKanbanTask({
					taskId: data.taskId,
					claimToken: data.claimToken,
					runId: data.runId,
					note: data.note,
				});
				return json({
					ok: true,
					action: data.action,
					task: hb.task,
					heartbeatAt: hb.heartbeatAt,
					claimExpiresAt: hb.claimExpiresAt,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'complete': {
				const task = await completeKanbanTask({
					taskId: data.taskId,
					workerId: data.workerId,
				});
				return json({
					ok: true,
					action: data.action,
					task,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'block': {
				const task = await blockKanbanTask({
					taskId: data.taskId,
					reason: data.reason,
				});
				return json({
					ok: true,
					action: data.action,
					task,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'retry': {
				const task = await retryKanbanTask({
					taskId: data.taskId,
					reason: data.reason,
				});
				return json({
					ok: true,
					action: data.action,
					task,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'reclaim_stale': {
				const task = await reclaimStaleKanbanTask({
					taskId: data.taskId,
				});
				return json({
					ok: true,
					action: data.action,
					task,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: null,
				});
			}

			case 'agent_dispatch': {
				return json({
					ok: false,
					action: data.action,
					recommendationProjection: null,
					reviewEvent: null,
					canonicalAuthority: false as const,
					error: 'AGENT_DISPATCH_UNAVAILABLE_VALIDATED_WORKER_REQUIRED',
				}, { status: 409 });
			}

			case 'review_decision': {
				const reviewed = recordReviewDecisionV1(
					data.recommendation as never,
					data.decision,
					{
						reviewerId: data.reviewerId,
						notes: data.notes,
					},
				);
				return json({
					ok: true,
					action: data.action,
					task: null,
					recommendationProjection: reviewed.updatedRecommendation,
					reviewEvent: reviewed.reviewEvent,
					canonicalAuthority: false as const,
					error: null,
				});
			}
		}
	} catch (error) {
		return json(
			{
				ok: false,
				action: data.action,
				task: null,
				recommendationProjection: null,
				reviewEvent: null,
				canonicalAuthority: false as const,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 400 },
		);
	}
};
