import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	listKanbanTaskEvents,
	listKanbanTaskAttempts,
	listKanbanTasks,
	showKanbanTask,
	type KanbanTask,
	type KanbanTaskEvent,
} from '$lib/server/atlas/kanban-task-board.js';
import { loadQuickHitPreview } from './quick-hit-preview.server.js';

const BOARD_LIMIT = 200;
const EVENT_LIMIT = 25;

type InvalidTask = { taskId: string; issues: string[] };
type BoardCard = Pick<KanbanTask, 'taskId' | 'featureLabel' | 'lane' | 'status' | 'priority'
	| 'assignee' | 'sourceRefs' | 'validationCommand' | 'attemptCount' | 'failureCount'>;
type BoardEvent = Pick<KanbanTaskEvent, 'taskId' | 'eventType' | 'createdAt'>;

function toBoardCard(task: KanbanTask): BoardCard {
	const { taskId, featureLabel, lane, status, priority, assignee, sourceRefs, validationCommand, attemptCount, failureCount } = task;
	return { taskId, featureLabel, lane, status, priority, assignee, sourceRefs, validationCommand, attemptCount, failureCount };
}

/** Read-only projection of the existing PostgreSQL Kanban store. Never writes; never canonical. */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas/taskboard');
	if (locals.user.role !== 'admin') throw redirect(303, '/admin/atlas');

	const selectedId = url.searchParams.get('ticket');
	const preview = await loadQuickHitPreview();
	// Same top-level keys on success and failure (degraded response contract).
	const degraded = {
		ok: false,
		total: 0,
		todo: [] as BoardCard[],
		inProgress: [] as BoardCard[],
		done: [] as BoardCard[],
		invalid: [] as InvalidTask[],
		events: [] as BoardEvent[],
		selected: null,
		selectionError: null as string | null,
		previewStatus: preview.status,
		recommendations: preview.sources.map((source) => ({
			...source,
			ticketId: null as string | null,
			ticketStatus: !source.current ? 'STALE_PROJECTION'
				: source.identityStatus === 'UNRESOLVED' ? 'IDENTITY_UNRESOLVED' : 'TICKET_LOOKUP_UNAVAILABLE',
		})),
		canonicalAuthority: false as const,
		error: null as string | null,
	};

	try {
		const [board, events, recommendations, detail] = await Promise.all([
			listKanbanTasks({ limit: BOARD_LIMIT }),
			listKanbanTaskEvents({ limit: EVENT_LIMIT }),
			Promise.all(preview.sources.map(async (source) => {
				const key = source.canonicalTaskKeyCandidate;
				if (!source.current || source.identityStatus !== 'SOURCE_MATCH' || !key) {
					return { ...source, ticketId: null, ticketStatus: source.current ? 'IDENTITY_UNRESOLVED' : 'STALE_PROJECTION' };
				}
				try {
					const ticket = await showKanbanTask({ taskId: key });
					const sourceLocator = `${source.sourceRef}#L${source.sourceLine}`;
					const sourceMatch = ticket?.taskId === key && (
						ticket.sourceRefs.includes(sourceLocator)
						|| (ticket.sourceRefs.includes(source.sourceRef) && ticket.featureLabel.trim() === source.taskText)
					);
					if (!sourceMatch) return { ...source, ticketId: null, ticketStatus: 'NO_VERIFIED_TICKET' };
					const revisionBound = ticket.sourceRevision === source.sourceFileSha256;
					return {
						...source,
						ticketId: key,
						ticketStatus: revisionBound ? 'VERIFIED_TICKET' : 'MATCHED_UNREVISIONED',
					};
				} catch {
					return { ...source, ticketId: null, ticketStatus: 'TICKET_LOOKUP_UNAVAILABLE' };
				}
			})),
			selectedId && selectedId.length <= 256 ? getTicketDetails(selectedId).catch(() => null) : null,
		]);
		return {
			...degraded,
			ok: true,
			total: board.total,
			todo: board.tasks.filter((task) => task.lane === 'todo').map(toBoardCard),
			inProgress: board.tasks.filter((task) => task.lane === 'in_progress').map(toBoardCard),
			done: board.tasks.filter((task) => task.lane === 'done').map(toBoardCard),
			invalid: board.invalid,
			events: events.map(({ taskId, eventType, createdAt }) => ({ taskId, eventType, createdAt })),
			recommendations,
			selected: detail,
			selectionError: selectedId && !detail ? 'Ticket details are unavailable.' : null,
		};
	} catch (error) {
		console.warn('[atlas/taskboard] Kanban read unavailable', (error as { code?: string })?.code);
		return { ...degraded, error: 'Kanban data is temporarily unavailable.' };
	}
};

async function getTicketDetails(taskId: string) {
	const ticket = await showKanbanTask({ taskId });
	if (!ticket) return null;
	const [events, attempts] = await Promise.all([
		listKanbanTaskEvents({ taskId, limit: EVENT_LIMIT }),
		listKanbanTaskAttempts({ taskId, limit: EVENT_LIMIT }),
	]);
	return {
		taskId,
		title: ticket.featureLabel,
		status: ticket.status,
		priority: ticket.priority ?? null,
		owner: ticket.assignee ?? null,
		sourceRefs: ticket.sourceRefs,
		sourceRevision: ticket.sourceRevision ?? null,
		dispatchBlockers: events.flatMap((event) =>
			event.eventType === 'blocked' && typeof event.payload.reason === 'string' ? [event.payload.reason] : []
		),
		receipts: attempts.flatMap((attempt) => attempt.executionReceiptId ? [{
			runId: attempt.runId,
			receiptId: attempt.executionReceiptId,
			success: attempt.success,
		}] : []),
	};
}
