// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	searchDocCorpus: vi.fn(),
	findRepoRoot: vi.fn(() => '/repo')
}));

vi.mock('$lib/server/db/client', () => ({ pool: { marker: 'pool' } }));
vi.mock('$lib/server/auth-utils', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('$lib/server/atlas/docs/doc-intelligence-read-model.js', () => ({ searchDocCorpus: mocks.searchDocCorpus, findRepoRoot: mocks.findRepoRoot }));

let GET: (event: { url: URL }) => Promise<Response>;

beforeEach(async () => {
	vi.resetAllMocks();
	mocks.findRepoRoot.mockReturnValue('/repo');
	mocks.searchDocCorpus.mockResolvedValue({ query: 'x', mode: 'POSTGRES_FTS', hits: [], postgresNote: null });
	({ GET } = (await import('./+server.js')) as unknown as { GET: typeof GET });
});

const call = (qs: string) => GET({ url: new URL(`http://localhost/api/admin/atlas/docs-corpus/search?${qs}`) });

describe('GET /api/admin/atlas/docs-corpus/search', () => {
	it('rejects a non-admin before any search runs', async () => {
		mocks.requireAdmin.mockImplementation(() => { throw new Response('forbidden', { status: 403 }); });
		await expect(call('q=io_method')).rejects.toBeInstanceOf(Response);
		expect(mocks.searchDocCorpus).not.toHaveBeenCalled();
	});

	it('400s an invalid query with a same-shape body and does not search', async () => {
		const res = await call('q=x');
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ hits: [], mode: 'LOCAL_LEXICAL', error: 'INVALID_QUERY' });
		expect(mocks.searchDocCorpus).not.toHaveBeenCalled();
	});

	it('passes query, bounded limit and product/version filters to the read model and disables caching', async () => {
		const res = await call('q=hnsw.iterative_scan&limit=5&product=pgvector&productVersion=CURRENT_UPSTREAM%402026-09-23');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(mocks.searchDocCorpus).toHaveBeenCalledWith({ pool: { marker: 'pool' }, root: '/repo', q: 'hnsw.iterative_scan', limit: 5, product: 'pgvector', productVersion: 'CURRENT_UPSTREAM@2026-09-23' });
	});

	it('defaults limit to 10, omits empty filters, and 400s an over-large limit', async () => {
		await call('q=io_method');
		expect(mocks.searchDocCorpus).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, product: null, productVersion: null }));
		mocks.searchDocCorpus.mockClear();
		expect((await call('q=io_method&limit=999')).status).toBe(400);
		expect(mocks.searchDocCorpus).not.toHaveBeenCalled();
	});
});
