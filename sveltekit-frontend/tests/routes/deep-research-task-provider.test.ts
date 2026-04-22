// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const {
	mockDbSelect,
	mockDbInsert,
	mockDbUpdate,
	mockSelectFrom,
	mockSelectWhere,
	mockSelectOrderBy,
	mockSelectLimit,
	mockInsertValues,
	mockInsertReturning,
	mockUpdateSet,
	mockUpdateWhere,
	mockUpdateReturning,
	mockRunResearchTask,
	mockStartDeepResearch,
	mockGetDeepResearchStatus,
	mockFollowUpDeepResearch,
	mockApproveResearchPlan,
	mockIsDeepResearchEnabled,
} = vi.hoisted(() => ({
	mockDbSelect: vi.fn(),
	mockDbInsert: vi.fn(),
	mockDbUpdate: vi.fn(),
	mockSelectFrom: vi.fn(),
	mockSelectWhere: vi.fn(),
	mockSelectOrderBy: vi.fn(),
	mockSelectLimit: vi.fn(),
	mockInsertValues: vi.fn(),
	mockInsertReturning: vi.fn(),
	mockUpdateSet: vi.fn(),
	mockUpdateWhere: vi.fn(),
	mockUpdateReturning: vi.fn(),
	mockRunResearchTask: vi.fn(),
	mockStartDeepResearch: vi.fn(),
	mockGetDeepResearchStatus: vi.fn(),
	mockFollowUpDeepResearch: vi.fn(),
	mockApproveResearchPlan: vi.fn(),
	mockIsDeepResearchEnabled: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: (...args: unknown[]) => {
			mockDbSelect(...args);
			return { from: mockSelectFrom };
		},
		insert: (...args: unknown[]) => {
			mockDbInsert(...args);
			return { values: mockInsertValues };
		},
		update: (...args: unknown[]) => {
			mockDbUpdate(...args);
			return { set: mockUpdateSet };
		},
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	userResearchTasks: {
		id: 'id',
		userId: 'user_id',
		sessionId: 'session_id',
		createdAt: 'created_at',
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: (...args: unknown[]) => ({ type: 'eq', args }),
	and: (...args: unknown[]) => ({ type: 'and', args }),
	desc: (...args: unknown[]) => ({ type: 'desc', args }),
}));

vi.mock('$lib/server/research/task-runner.js', () => ({
	runResearchTask: (...args: unknown[]) => mockRunResearchTask(...args),
}));

vi.mock('$lib/server/ai/deep-research-client.js', () => ({
	approveResearchPlan: (...args: unknown[]) => mockApproveResearchPlan(...args),
	getDeepResearchStatus: (...args: unknown[]) => mockGetDeepResearchStatus(...args),
	followUpDeepResearch: (...args: unknown[]) => mockFollowUpDeepResearch(...args),
	isDeepResearchEnabled: (...args: unknown[]) => mockIsDeepResearchEnabled(...args),
	startDeepResearch: (...args: unknown[]) => mockStartDeepResearch(...args),
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

function makeInteraction(overrides: Record<string, unknown> = {}) {
	return {
		id: 'intr-1',
		status: 'completed',
		created: '2026-04-21T00:00:00.000Z',
		updated: '2026-04-21T00:00:05.000Z',
		outputs: [
			{
				type: 'thought',
				summary: [{ type: 'text', text: 'Draft a two-step research plan.' }],
			},
			{ type: 'text', text: 'Final grounded answer.' },
			{ type: 'image', data: 'YWJj', mime_type: 'image/png', resolution: 'high' },
		],
		...overrides,
	};
}

describe('Research task provider routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
		mockInsertReturning.mockResolvedValue([
			{
				id: 'task-1',
				title: 'Google Task',
				selfPrompt: 'Find hearsay precedent',
				pipelineHint: 'ace',
				result: { provider: 'google' },
				status: 'running',
			},
		]);

		mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
		mockSelectWhere.mockReturnValue({ orderBy: mockSelectOrderBy });
		mockSelectOrderBy.mockReturnValue({ limit: mockSelectLimit });
		mockSelectLimit.mockResolvedValue([
			{
				id: 'task-google-done-1',
				title: 'Completed Google Task',
				selfPrompt: 'Investigate hearsay reliability',
				pipelineHint: 'ace',
				status: 'done',
				result: {
					provider: 'google',
					pipeline: 'ace',
					answer: 'Final grounded answer.',
					durationMs: 2200,
					interactionId: 'intr-1',
					imageCount: 1,
					images: [
						{
							src: 'data:image/png;base64,YWJj',
							uri: null,
							mimeType: 'image/png',
							resolution: 'high',
						},
					],
					thoughtSummaries: ['Draft a two-step research plan.'],
				},
				summaryId: 'summary-1',
			},
		]);

		mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
		mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
		mockUpdateReturning.mockResolvedValue([
			{
				id: 'task-1',
				selfPrompt: 'Find hearsay precedent',
				pipelineHint: 'ace',
				result: { provider: 'google' },
				status: 'running',
			},
		]);

		mockRunResearchTask.mockResolvedValue(undefined);
	});

	it('returns 400 for invalid task payloads', async () => {
		const { POST } = await import('../../src/routes/api/tasks/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/tasks',
			body: { title: 'Missing prompt' },
		});

		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('preserves Google image and thought-summary metadata when loading tasks', async () => {
		const { GET } = await import('../../src/routes/api/tasks/+server.js');
		const event = makeAuthEvent({
			method: 'GET',
			url: '/api/tasks',
		});

		const res = await GET(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<{ tasks: Array<Record<string, unknown>> }>(res);
		expect(body.tasks).toHaveLength(1);
		expect(body.tasks[0]).toMatchObject({
			id: 'task-google-done-1',
			status: 'done',
			summaryId: 'summary-1',
			result: {
				provider: 'google',
				interactionId: 'intr-1',
				imageCount: 1,
				images: [
					{
						src: 'data:image/png;base64,YWJj',
						uri: null,
						mimeType: 'image/png',
						resolution: 'high',
					},
				],
				thoughtSummaries: ['Draft a two-step research plan.'],
			},
		});
	});

	it('persists google provider and dispatches the shared runner when runNow is enabled', async () => {
		const { POST } = await import('../../src/routes/api/tasks/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/tasks',
			body: {
				title: 'Google Task',
				selfPrompt: 'Find hearsay precedent',
				pipelineHint: 'ace',
				provider: 'google',
				runNow: true,
			},
		});

		const res = await POST(event as any);
		expect(res.status).toBe(201);

		const body = await responseJson<Record<string, unknown>>(res);
		expect((body.task as Record<string, unknown>).id).toBe('task-1');

		const [insertValues] = mockInsertValues.mock.calls[0] ?? [{}];
		expect(insertValues).toMatchObject({
			status: 'running',
			result: { provider: 'google' },
		});
		expect(mockRunResearchTask).toHaveBeenCalledWith('task-1', {
			selfPrompt: 'Find hearsay precedent',
			pipelineHint: 'ace',
			provider: 'google',
		});
	});

	it('reruns an existing queued task through the shared runner', async () => {
		const { PATCH } = await import('../../src/routes/api/tasks/[id]/+server.js');
		const event = makeAuthEvent({
			method: 'PATCH',
			url: '/api/tasks/task-1',
			params: { id: 'task-1' },
			body: { run: true },
		});

		const res = await PATCH(event as any);
		expect(res.status).toBe(200);
		expect(mockRunResearchTask).toHaveBeenCalledWith('task-1', {
			selfPrompt: 'Find hearsay precedent',
			pipelineHint: 'ace',
		});
	});
});

describe('Google Deep Research route contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsDeepResearchEnabled.mockReturnValue(true);
		mockStartDeepResearch.mockResolvedValue(makeInteraction());
		mockApproveResearchPlan.mockResolvedValue(makeInteraction({ id: 'intr-approved' }));
		mockFollowUpDeepResearch.mockResolvedValue(makeInteraction({ id: 'intr-follow-up' }));
		mockGetDeepResearchStatus.mockResolvedValue(makeInteraction({ id: 'intr-polled' }));
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../../src/routes/api/analytics/deep-research/google/+server.js');
		const event = makeEvent({
			method: 'POST',
			url: '/api/analytics/deep-research/google',
			body: { action: 'start', input: 'Investigate hearsay' },
		});

		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 202 with normalized thought summaries and images for collaborative planning starts', async () => {
		const { POST } = await import('../../src/routes/api/analytics/deep-research/google/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/analytics/deep-research/google',
			body: {
				action: 'start',
				input: 'Investigate hearsay',
				collaborativePlanning: true,
				visualization: 'auto',
				thinkingSummaries: 'auto',
			},
		});

		const res = await POST(event as any);
		expect(res.status).toBe(202);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.status).toBe('completed');
		expect(body.interactionId).toBe('intr-1');
		expect(body.imageCount).toBe(1);
		expect(body.images).toEqual([
			{
				src: 'data:image/png;base64,YWJj',
				uri: null,
				mimeType: 'image/png',
				resolution: 'high',
			},
		]);
		expect(body.thoughtSummaries).toEqual(['Draft a two-step research plan.']);
		expect(mockStartDeepResearch).toHaveBeenCalledWith(expect.objectContaining({
			input: 'Investigate hearsay',
			collaborativePlanning: true,
		}));
	});

	it('delegates approve-plan actions and returns the normalized approved interaction', async () => {
		const { POST } = await import('../../src/routes/api/analytics/deep-research/google/+server.js');
		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/analytics/deep-research/google',
			body: {
				action: 'approve-plan',
				interactionId: 'intr-1',
				message: 'Approved. Run the report.',
			},
		});

		const res = await POST(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.interactionId).toBe('intr-approved');
		expect(mockApproveResearchPlan).toHaveBeenCalledWith('intr-1', 'Approved. Run the report.');
	});
});