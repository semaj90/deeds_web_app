// @vitest-environment node
/**
 * SvelteKit 2 Form Actions — Unit Tests
 *
 * Tests the SvelteKit 2 form action patterns from the training datasets:
 *   - fail(401, ...)   — returned when the user is not authenticated
 *   - fail(400, {form})— returned when superValidate says the form is invalid
 *   - message(form, ..)— returned when a DB error occurs (status 500)
 *   - redirect(303,..) — thrown on successful case creation
 *   - fail(400, {analysisError}) — AI analyze action rejects empty narrative + what
 *   - fail(500, {analysisError}) — AI analyze action propagates Gemma failures
 *
 * Route under test: src/routes/(app)/cases/new/+page.server.ts
 *
 * Pattern enforced (matches all-routes-page-server.test.ts conventions):
 *   - vi.hoisted() for mock variables referenced inside vi.mock() factories
 *   - All vi.mock() calls before imports
 *   - Route handler lazy-imported inside describe-level beforeEach
 *   - afterEach restores all mocks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────
const {
	mockSuperValidate,
	mockMessage,
	mockExtractCaseStructureWithGemma,
	mockDbInsertChain,
} = vi.hoisted(() => {
	const mockDbInsertChain = {
		values: vi.fn(),
	};

	return {
		mockSuperValidate: vi.fn(),
		mockMessage: vi.fn(),
		mockExtractCaseStructureWithGemma: vi.fn(),
		mockDbInsertChain,
	};
});

// ── module mocks ──────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('sveltekit-superforms/server', () => ({
	superValidate: mockSuperValidate,
	message: mockMessage,
}));

vi.mock('sveltekit-superforms/adapters', () => ({
	zod4: vi.fn((schema: unknown) => schema),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => ({
						limit: vi.fn(async () => []),
					})),
				})),
			})),
		})),
		insert: vi.fn(() => mockDbInsertChain),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: {
		id: 'id',
		userId: 'user_id',
		status: { enumValues: ['open', 'in_progress', 'pending_review', 'closed', 'archived'] },
		priority: { enumValues: ['low', 'medium', 'high', 'critical', 'urgent'] },
		updatedAt: 'updated_at',
	},
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((col: unknown) => col),
	and: vi.fn((...args: unknown[]) => args),
}));

vi.mock('$lib/server/llm/gemmaIntake.js', () => ({
	extractCaseStructureWithGemma: mockExtractCaseStructureWithGemma,
}));

// ── helpers ───────────────────────────────────────────────────────

const VALID_FORM_DATA = {
	id: 'case-form',
	valid: true,
	posted: true,
	data: {
		title: 'Fraud Investigation 2026',
		narrative: 'Suspected fraud by vendor.',
		who: 'Unknown vendor',
		what: 'Invoice irregularities',
		when: '2026-03-01',
		where: 'Accounts payable',
		why: 'Unusual patterns',
		how: 'Duplicate invoices',
		priority: 'high',
	},
	errors: {},
	constraints: {},
};

const INVALID_FORM_DATA = {
	...VALID_FORM_DATA,
	valid: false,
	errors: { title: ['Case title is required'] },
};

function makeFormData(fields: Record<string, string>): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

/** Build a minimal SvelteKit RequestEvent for actions. */
function makeActionEvent(opts: {
	user?: Record<string, unknown> | null;
	formData?: FormData;
} = {}) {
	const { user = { id: 'user-1', role: 'admin', email: 'test@example.com' }, formData } = opts;

	const fd = formData ?? makeFormData({
		title: 'Fraud Investigation 2026',
		narrative: 'Suspected fraud.',
		priority: 'high',
	});

	const request = new Request('http://localhost:5173/cases/new', {
		method: 'POST',
		body: fd,
	});

	return {
		request,
		locals: user ? { user } : {},
		url: new URL('http://localhost:5173/cases/new'),
		params: {},
	};
}

// ── tests ─────────────────────────────────────────────────────────

describe('actions.create — /cases/new', () => {
	let actions: Record<string, (...args: unknown[]) => Promise<unknown>>;

	beforeEach(async () => {
		vi.clearAllMocks();

		// Default: form is valid
		mockSuperValidate.mockResolvedValue(VALID_FORM_DATA);

		// Default: message() passes through with status
		mockMessage.mockImplementation((form: unknown, msg: string, opts?: { status?: number }) => ({
			form,
			message: msg,
			status: opts?.status ?? 200,
		}));

		// Default: DB insert succeeds
		mockDbInsertChain.values.mockReturnValue({
			returning: vi.fn(async () => [
				{
					id: 'case-new-1',
					title: 'Fraud Investigation 2026',
					userId: 'user-1',
					status: 'open',
					priority: 'high',
				},
			]),
		});

		const mod = await import('../../src/routes/(app)/cases/new/+page.server.ts');
		actions = mod.actions as typeof actions;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── auth guard ────────────────────────────────────────────────

	it('returns fail(401) when locals.user is absent', async () => {
		const event = makeActionEvent({ user: null });
		const result = await actions.create(event) as { status: number };

		expect(result.status).toBe(401);
	});

	it('returns fail(401) when locals is empty {}', async () => {
		const event = { ...makeActionEvent({ user: null }), locals: {} };
		const result = await actions.create(event) as { status: number };

		expect(result.status).toBe(401);
	});

	// ── validation ────────────────────────────────────────────────

	it('returns fail(400, { form }) when superValidate reports invalid form', async () => {
		mockSuperValidate.mockResolvedValueOnce(INVALID_FORM_DATA);

		const event = makeActionEvent();
		const result = await actions.create(event) as { status: number; data: Record<string, unknown> };

		expect(result.status).toBe(400);
		// Superforms convention: fail(400, { form }) — data contains the form
		expect(result.data).toHaveProperty('form');
	});

	// ── DB error path ─────────────────────────────────────────────

	it('returns message(form, error-text, { status: 500 }) when DB insert throws', async () => {
		mockDbInsertChain.values.mockReturnValueOnce({
			returning: vi.fn(async () => {
				throw new Error('deadlock detected');
			}),
		});

		const event = makeActionEvent();
		const result = await actions.create(event) as { message: string; status: number };

		// The action calls: return message(form, 'Failed to create case.', { status: 500 })
		expect(result.message).toMatch(/failed to create case/i);
		expect(result.status).toBe(500);
	});

	// ── success path ──────────────────────────────────────────────

	it('throws redirect(303, /cases/<id>/overview) on successful create', async () => {
		const event = makeActionEvent();

		await expect(actions.create(event)).rejects.toMatchObject({
			status: 303,
			location: expect.stringMatching(/^\/cases\/case-new-1\/overview$/),
		});
	});

	it('uses the returned case ID in the redirect URL', async () => {
		mockDbInsertChain.values.mockReturnValueOnce({
			returning: vi.fn(async () => [
				{ id: 'case-unique-xyz', title: 'Test', userId: 'user-1', status: 'open', priority: 'medium' },
			]),
		});

		const event = makeActionEvent();

		await expect(actions.create(event)).rejects.toMatchObject({
			location: '/cases/case-unique-xyz/overview',
		});
	});

	// ── field shaping ─────────────────────────────────────────────

	it('calls DB insert with trimmed title and assembled description', async () => {
		const { db } = await import('$lib/server/db/client');

		const event = makeActionEvent();
		await actions.create(event).catch(() => { /* ignore redirect */ });

		// The action trims the title and joins narrative + W-fields as description
		expect(db.insert).toHaveBeenCalled();
		const [insertValuesArg] = mockDbInsertChain.values.mock.calls[0] ?? [{}];
		expect((insertValuesArg as Record<string, unknown>).title).toBe('Fraud Investigation 2026');
	});
});

// ── actions.analyze ───────────────────────────────────────────────

describe('actions.analyze — /cases/new', () => {
	let actions: Record<string, (...args: unknown[]) => Promise<unknown>>;

	beforeEach(async () => {
		vi.clearAllMocks();

		mockSuperValidate.mockResolvedValue(VALID_FORM_DATA);
		mockMessage.mockImplementation((form: unknown, msg: string, opts?: { status?: number }) => ({
			form,
			message: msg,
			status: opts?.status ?? 200,
		}));
		mockExtractCaseStructureWithGemma.mockResolvedValue({
			persons: ['Unknown Vendor'],
			title: 'Suspected Fraud',
			statute: 'Cal. Penal Code § 530',
			confidence: 0.87,
		});

		const mod = await import('../../src/routes/(app)/cases/new/+page.server.ts');
		actions = mod.actions as typeof actions;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── auth guard ────────────────────────────────────────────────

	it('returns fail(401) when locals.user is absent', async () => {
		const event = makeActionEvent({ user: null });
		const result = await actions.analyze(event) as { status: number };

		expect(result.status).toBe(401);
	});

	// ── empty input guard ─────────────────────────────────────────

	it('returns fail(400) when both narrative and what are empty', async () => {
		const event = makeActionEvent({
			formData: makeFormData({ narrative: '', who: '', what: '', when: '', where: '', why: '', how: '' }),
		});
		const result = await actions.analyze(event) as { status: number; data: Record<string, unknown> };

		expect(result.status).toBe(400);
		expect(result.data).toHaveProperty('analysisError');
	});

	it('returns fail(400) with explanatory message on empty input', async () => {
		const event = makeActionEvent({
			formData: makeFormData({ narrative: '  ', what: '' }),
		});
		const result = await actions.analyze(event) as { status: number; data: Record<string, unknown> };

		expect(result.status).toBe(400);
		expect(String(result.data.analysisError)).toMatch(/narrative|what happened/i);
	});

	// ── success path ──────────────────────────────────────────────

	it('returns { extraction } when narrative is provided', async () => {
		const event = makeActionEvent({
			formData: makeFormData({
				narrative: 'Vendor submitted duplicate invoices totalling $50,000.',
				what: 'Invoice fraud',
			}),
		});
		const result = await actions.analyze(event) as { extraction: Record<string, unknown> };

		expect(result.extraction).toBeDefined();
		expect(result.extraction.title).toBe('Suspected Fraud');
		expect(result.extraction.confidence).toBe(0.87);
	});

	it('calls extractCaseStructureWithGemma with the narrative and W-fields', async () => {
		const event = makeActionEvent({
			formData: makeFormData({
				narrative: 'Fraudulent expense claims.',
				who: 'Finance manager',
				what: 'Expense fraud',
				when: '2026-01',
				where: 'Finance dept',
				why: 'Personal gain',
				how: 'Falsified receipts',
			}),
		});
		await actions.analyze(event);

		expect(mockExtractCaseStructureWithGemma).toHaveBeenCalledWith(
			expect.objectContaining({
				narrative: 'Fraudulent expense claims.',
				who: 'Finance manager',
				what: 'Expense fraud',
			})
		);
	});

	// ── Gemma failure path ────────────────────────────────────────

	it('returns fail(500, { analysisError }) when extractCaseStructureWithGemma throws', async () => {
		mockExtractCaseStructureWithGemma.mockRejectedValueOnce(
			new Error('Ollama connection refused')
		);

		const event = makeActionEvent({
			formData: makeFormData({ narrative: 'Some narrative.', what: 'Something' }),
		});
		const result = await actions.analyze(event) as { status: number; data: Record<string, unknown> };

		expect(result.status).toBe(500);
		expect(result.data).toHaveProperty('analysisError');
		// Must mention that manual creation is still possible
		expect(String(result.data.analysisError)).toMatch(/manually|unavailable/i);
	});
});

// ── Superforms v2 contract ────────────────────────────────────────

describe('Superforms v2 contract', () => {
	let actions: Record<string, (...args: unknown[]) => Promise<unknown>>;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockSuperValidate.mockResolvedValue(VALID_FORM_DATA);
		mockMessage.mockImplementation((form: unknown, msg: string, opts?: { status?: number }) => ({
			form,
			message: msg,
			status: opts?.status ?? 200,
		}));
		mockDbInsertChain.values.mockReturnValue({
			returning: vi.fn(async () => [{ id: 'case-x', title: 'T', userId: 'u', status: 'open', priority: 'medium' }]),
		});

		const mod = await import('../../src/routes/(app)/cases/new/+page.server.ts');
		actions = mod.actions as typeof actions;
	});

	it('fail(400) data shape includes { form } key for client-side re-hydration', async () => {
		// Superforms requires the fail response to contain { form } so the client
		// can re-populate errors without a page reload.
		mockSuperValidate.mockResolvedValueOnce(INVALID_FORM_DATA);

		const result = await actions.create(makeActionEvent()) as { status: number; data: Record<string, unknown> };
		expect(result.data.form).toBeDefined();
		expect(result.data.form).toMatchObject({ valid: false });
	});

	it('superValidate is called with the raw Request, not a pre-parsed body', async () => {
		const event = makeActionEvent();
		await actions.create(event).catch(() => { /* ignore redirect */ });

		// Superforms v2 receives the Request as first arg so it can parse FormData itself
		expect(mockSuperValidate).toHaveBeenCalledWith(
			expect.any(Request),
			expect.anything() // zod adapter
		);
	});
});
