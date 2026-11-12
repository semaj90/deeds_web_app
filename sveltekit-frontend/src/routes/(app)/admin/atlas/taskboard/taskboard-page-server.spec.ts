import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import Taskboard from './+page.svelte';

const listKanbanTasks = vi.hoisted(() => vi.fn());
const listKanbanTaskEvents = vi.hoisted(() => vi.fn());
const listKanbanTaskAttempts = vi.hoisted(() => vi.fn());
const showKanbanTask = vi.hoisted(() => vi.fn());
const loadQuickHitPreview = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/atlas/kanban-task-board.js', () => ({
	listKanbanTasks,
	listKanbanTaskEvents,
	listKanbanTaskAttempts,
	showKanbanTask,
}));
vi.mock('./quick-hit-preview.server.js', () => ({ loadQuickHitPreview }));

import { load } from './+page.server';

type Board = {
	todo: { taskId: string }[];
	inProgress: { taskId: string }[];
	done: { taskId: string }[];
	invalid: unknown[];
	events: unknown[];
};

function event(user: unknown, search = '') {
	return { locals: { user }, url: new URL(`http://localhost/admin/atlas/taskboard${search}`) } as unknown as Parameters<typeof load>[0];
}

function task(taskId: string, lane: 'todo' | 'in_progress' | 'done') {
	return {
		taskId,
		featureId: `feature-${taskId}`,
		featureLabel: `Feature ${taskId}`,
		sourceRefs: ['openspec/changes/sample/tasks.md'],
		lane,
		status: lane === 'done' ? 'completed' : 'pending',
		validationCommand: null,
		createdAt: '2026-11-11T00:00:00.000Z',
		updatedAt: '2026-11-11T00:00:00.000Z',
	};
}

describe('Atlas taskboard SSR loader (read-only)', () => {
	beforeEach(() => {
		listKanbanTasks.mockReset();
		listKanbanTaskEvents.mockReset();
		listKanbanTaskAttempts.mockReset();
		showKanbanTask.mockReset();
		loadQuickHitPreview.mockReset().mockResolvedValue({ status: 'MISSING', sources: [] });
	});

	it('redirects an anonymous user to login without reading the store', async () => {
		await expect(load(event(null))).rejects.toMatchObject({
			status: 303,
			location: '/login?redirect=/admin/atlas/taskboard',
		});
		expect(listKanbanTasks).not.toHaveBeenCalled();
		expect(loadQuickHitPreview).not.toHaveBeenCalled();
	});

	it('redirects a non-admin user without reading the store', async () => {
		await expect(load(event({ id: 1, role: 'user' }))).rejects.toMatchObject({
			status: 303,
			location: '/admin/atlas',
		});
		expect(listKanbanTasks).not.toHaveBeenCalled();
		expect(listKanbanTaskEvents).not.toHaveBeenCalled();
	});

	it('splits tickets by lane for an admin and reports invalid rows', async () => {
		listKanbanTasks.mockResolvedValue({
			tasks: [task('a', 'todo'), task('b', 'in_progress'), task('c', 'done'), task('d', 'todo')],
			total: 4,
			invalid: [{ taskId: 'bad', issues: ['lane: invalid'] }],
		});
		listKanbanTaskEvents.mockResolvedValue([
			{ taskId: 'a', eventType: 'ticket_created', payload: {}, createdAt: '2026-11-11T00:00:00.000Z' },
		]);

		const data = (await load(event({ id: 1, role: 'admin' }))) as unknown as Board;

		expect(data).toMatchObject({ ok: true, total: 4, canonicalAuthority: false, error: null });
		expect(data.todo.map((t: { taskId: string }) => t.taskId)).toEqual(['a', 'd']);
		expect(data.inProgress.map((t: { taskId: string }) => t.taskId)).toEqual(['b']);
		expect(data.done.map((t: { taskId: string }) => t.taskId)).toEqual(['c']);
		expect(data.invalid).toEqual([{ taskId: 'bad', issues: ['lane: invalid'] }]);
		expect(data.events).toHaveLength(1);
	});

	it('returns the same keys, empty, when the store fails', async () => {
		listKanbanTasks.mockRejectedValue(new Error('db down'));
		listKanbanTaskEvents.mockResolvedValue([]);

		const data = await load(event({ id: 1, role: 'admin' }));

		expect(data).toMatchObject({
			ok: false,
			total: 0,
			todo: [],
			inProgress: [],
			done: [],
			invalid: [],
			events: [],
			canonicalAuthority: false,
			error: 'Kanban data is temporarily unavailable.',
		});
	});

	it('renders three recommendations and opens only the exact source-bound ticket', async () => {
		const sourceRef = 'openspec/changes/sample/tasks.md';
		const fileRevision = `sha256:${'a'.repeat(64)}`;
		const row = { ...task('openspec:sample#exact', 'todo'),
			sourceRefs: [`${sourceRef}#L10`], sourceRevision: fileRevision, claimToken: 'private-token' };
		const source = {
			sourceRef,
			sourceLine: 10,
			sourceRevision: null,
			sourceFileSha256: fileRevision,
			taskText: 'Exact source text differs from the change heading',
			identityStatus: 'SOURCE_MATCH',
			canonicalTaskKeyCandidate: row.taskId,
			current: true,
			acceptanceGates: ['Compare the fixture'],
			blockers: [],
		};
		loadQuickHitPreview.mockResolvedValue({ status: 'AVAILABLE', sources: [
			source,
			{ ...source, sourceLine: 11, canonicalTaskKeyCandidate: 'wrong-text', taskText: 'Other task' },
			{ ...source, sourceLine: 12, canonicalTaskKeyCandidate: 'stale', current: false },
		] });
		listKanbanTasks.mockResolvedValue({ tasks: [row], total: 1, invalid: [] });
		listKanbanTaskEvents.mockImplementation(async ({ taskId }) =>
			taskId ? [{ eventType: 'blocked', payload: { reason: 'Validated worker required' } }] : []);
		listKanbanTaskAttempts.mockResolvedValue([{ runId: 'run-1', executionReceiptId: 'receipt-1', success: true }]);
		showKanbanTask.mockImplementation(async ({ taskId }) =>
			taskId === row.taskId ? row : { ...row, taskId });

		const data = await load(event({ id: 1, role: 'admin' }, '?ticket=openspec%3Asample%23exact'));
		expect(data.recommendations.map((recommendation) => recommendation.ticketStatus))
			.toEqual(['VERIFIED_TICKET', 'NO_VERIFIED_TICKET', 'STALE_PROJECTION']);
		expect(showKanbanTask).not.toHaveBeenCalledWith({ taskId: 'stale' });
		expect(JSON.stringify(data)).not.toContain('private-token');
		expect(listKanbanTaskAttempts).toHaveBeenCalledWith({ taskId: row.taskId, limit: 25 });
		const { container, getByRole } = render(Taskboard, { props: { data } });
		expect(getByRole('link', { name: 'View revision-verified ticket' }).getAttribute('href'))
			.toBe('?ticket=openspec%3Asample%23exact#ticket-details');
		expect(container.textContent).toContain('No verified matching ticket.');
		expect(container.textContent).toContain('Source changed.');
		expect(container.textContent).toContain('receipt-1');
		expect(container.textContent).toContain('Validated worker required');
		expect(container.querySelector('form')).toBeNull();
	});

	it('shows an exact ticket with no source revision as review-only, not verified', async () => {
		const taskId = 'parent-atlas-sample#0123456789abcdef';
		const sourceRef = 'openspec/changes/sample/tasks.md';
		const row = { ...task(taskId, 'todo'), sourceRefs: [`${sourceRef}#L10`], sourceRevision: null };
		loadQuickHitPreview.mockResolvedValue({ status: 'AVAILABLE', sources: [{
			sourceRef,
			sourceLine: 10,
			taskText: 'Review this task',
			taskHash: `sha256:${'b'.repeat(64)}`,
			sourceFileSha256: `sha256:${'a'.repeat(64)}`,
			sourceRevision: null,
			taskKey: taskId,
			identityStatus: 'SOURCE_MATCH',
			canonicalTaskKeyCandidate: taskId,
			blockers: [],
			acceptanceGates: ['Review source and receipt'],
			reviewRequired: true,
			current: true,
		}] });
		listKanbanTasks.mockResolvedValue({ tasks: [row], total: 1, invalid: [] });
		listKanbanTaskEvents.mockResolvedValue([]);
		showKanbanTask.mockResolvedValue(row);

		const data = await load(event({ id: 1, role: 'admin' }));
		expect(data.recommendations[0]).toMatchObject({ ticketId: taskId, ticketStatus: 'MATCHED_UNREVISIONED' });
		const { container, getByRole } = render(Taskboard, { props: { data } });
		expect(getByRole('link', { name: 'View matching ticket' })).toBeTruthy();
		expect(container.textContent).toContain('source revision is missing');
		expect(container.textContent).not.toContain('View revision-verified ticket');
	});
});
