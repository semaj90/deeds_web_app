import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	extract: vi.fn(),
	update: vi.fn(),
	insert: vi.fn(),
	invalidate: vi.fn()
}));

vi.mock('$lib/server/case-access.js', () => ({
	getAuthorizedCase: mocks.getAuthorizedCase,
	authorizedCaseFilter: vi.fn(() => null)
}));
vi.mock('$lib/server/db/client', () => ({ db: { update: mocks.update, insert: mocks.insert } }));
vi.mock('$lib/server/llm/gemmaIntake.js', () => ({ extractCaseStructureWithGemma: mocks.extract }));
vi.mock('$lib/server/cache/invalidation.js', () => ({ invalidateCaseCache: mocks.invalidate }));
vi.mock('$lib/server/db/ssr-health-check.js', () => ({ verifySSRDatabaseConnection: vi.fn() }));
vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({ syncCaseToGraph: vi.fn() }));

const caseId = 'b8fbe1be-dad0-4986-b51d-b28338acd71a';

function actionEvent(fields: Record<string, string | Blob>, id = '2') {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.append(name, value);
	return {
		locals: { user: { id } },
		request: Object.values(fields).some((value) => typeof value !== 'string')
			? { formData: async () => body }
			: new Request('http://localhost/cases', { method: 'POST', body })
	} as never;
}

describe('Cases security and form actions', () => {
	beforeEach(() => vi.resetAllMocks());

	it('requires a user and authorizes each read before returning private details', async () => {
		const { GET } = await import('../../api/cases/[id]/+server.js');
		const event = (id?: string) =>
			({ params: { id: caseId }, locals: { user: id ? { id } : null } }) as never;

		const anonymous = await GET(event());
		expect(anonymous.status).toBe(401);
		expect(mocks.getAuthorizedCase).not.toHaveBeenCalled();

		const record = { id: caseId, title: 'Private case' };
		mocks.getAuthorizedCase.mockResolvedValueOnce(record).mockResolvedValueOnce(null);
		const member = await GET(event('2'));
		expect(await member.json()).toEqual({ success: true, data: record });
		expect(member.headers.get('cache-control')).toBe('private, no-store');

		const outsider = await GET(event('3'));
		expect(outsider.status).toBe(404);
		expect(await outsider.json()).toMatchObject({ success: false, data: null });
		expect(mocks.getAuthorizedCase.mock.calls).toEqual([[caseId, 2], [caseId, 3]]);
	});

	it('does not allow DEV_BYPASS_AUTH or an invalid actor to write a case', async () => {
		const previous = process.env.DEV_BYPASS_AUTH;
		process.env.DEV_BYPASS_AUTH = 'true';
		try {
			const { PATCH, DELETE } = await import('../../api/cases/[id]/+server.js');
			const event = (user: { id: string; role?: string } | null) =>
				({
					params: { id: caseId },
					locals: { user },
					request: new Request('http://localhost/api/cases/' + caseId, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ status: 'closed' })
					})
				}) as never;

			expect((await PATCH(event(null))).status).toBe(401);
			expect((await DELETE(event(null))).status).toBe(401);
			expect((await PATCH(event({ id: 'invalid', role: 'admin' }))).status).toBe(401);
			expect(mocks.update).not.toHaveBeenCalled();
		} finally {
			if (previous === undefined) delete process.env.DEV_BYPASS_AUTH;
			else process.env.DEV_BYPASS_AUTH = previous;
		}
	});

	it('returns only current server data from both browser loads', async () => {
		const list = await import('./+page.js');
		const detail = await import('./[id]/+layout.js');
		const first = { cases: [{ id: caseId }], filters: { status: 'open' } };
		const refreshed = { cases: [], filters: { status: 'closed' } };
		expect(list.load({ data: first } as never)).toBe(first);
		expect(list.load({ data: refreshed } as never)).toBe(refreshed);

		const serverDetail = { caseData: { id: caseId, title: 'Fresh title' } };
		expect(detail.load({ data: serverDetail } as never)).toBe(serverDetail);
	});

	it('rejects a blank quick-create title and returns its field error', async () => {
		const { actions } = await import('./+page.server.js');
		const result = await actions.create(actionEvent({ title: '   ', description: 'Description' }));
		expect(result).toMatchObject({
			status: 400,
			data: { form: { errors: { title: ['Title is required'] } } }
		});
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('updates and invalidates the case IDs sent by the bulk form', async () => {
		const { actions } = await import('./+page.server.js');
		const returning = vi.fn().mockResolvedValue([{ id: caseId }]);
		const where = vi.fn().mockReturnValue({ returning });
		const set = vi.fn().mockReturnValue({ where });
		mocks.update.mockReturnValue({ set });
		mocks.invalidate.mockResolvedValue(undefined);

		const result = await actions.updateStatus(actionEvent({ caseId, status: 'closed' }));
		expect(result).toMatchObject({ success: true, count: 1 });
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
		expect(mocks.invalidate).toHaveBeenCalledWith(caseId, 'case_update', '2');
	});

	it.each([
		{},
		{ narrative: ' '.repeat(4), what: ' ' },
		{ narrative: 'x'.repeat(10_001) },
		{ narrative: new Blob(['a file']) }
	])('rejects invalid analysis input before calling the model', async (fields) => {
		const { actions } = await import('./new/+page.server.js');
		const result = await actions.analyze(actionEvent(fields as Record<string, string | Blob>));
		expect(result).toMatchObject({
			status: 400,
			data: { analysisError: expect.any(String) }
		});
		expect(mocks.extract).not.toHaveBeenCalled();
	});

	it('analyzes a valid narrative before a title has been chosen', async () => {
		const { actions } = await import('./new/+page.server.js');
		const extraction = { suggestedTitle: 'A suggested title', persons: [] };
		mocks.extract.mockResolvedValue(extraction);
		const result = await actions.analyze(actionEvent({ narrative: 'Valid description' }));
		expect(result).toEqual({ extraction });
		expect(mocks.extract).toHaveBeenCalledWith(expect.objectContaining({
			narrative: 'Valid description',
			who: ''
		}));
	});

	it('passes case requests through the service worker and clears old case responses', async () => {
		const origin = 'http://localhost';
		const privatePaths = ['/cases?status=open', '/cases/__data.json', '/active-cases', `/api/cases/${caseId}`];
		const entries = [...privatePaths, '/offline.html'].map((path) => ({ url: origin + path }));
		const handlers = new Map<string, (event: unknown) => void>();
		const remove = vi.fn();
		runInNewContext(readFileSync(new NodeURL('../../../../static/sw.js', import.meta.url), 'utf8'), {
			URL: NodeURL,
			console: { log: vi.fn() },
			caches: {
				keys: async () => ['legal-ai-static-v1.6.0'],
				open: async () => ({ keys: async () => entries, delete: remove })
			},
			self: {
				location: { origin },
				clients: { claim: vi.fn() },
				addEventListener: (type: string, handler: (event: unknown) => void) =>
					handlers.set(type, handler)
			}
		});

		const respondWith = vi.fn();
		for (const path of privatePaths) {
			handlers.get('fetch')?.({ request: { url: origin + path, method: 'GET' }, respondWith });
		}
		handlers.get('fetch')?.({ request: { url: origin + '/cases?/create', method: 'POST' }, respondWith });
		expect(respondWith).not.toHaveBeenCalled();

		const waitUntil = vi.fn();
		handlers.get('activate')?.({ waitUntil });
		expect(waitUntil).toHaveBeenCalledOnce();
		await waitUntil.mock.calls[0][0];
		expect(remove.mock.calls.flat()).toEqual(entries.slice(0, -1));
	});
});
