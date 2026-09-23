// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyPageAdmission, loadLivePageState, runResumableAdmissionV1, summarizePlan, type LivePageState } from './external-doc-admission-plan-v1.js';
import type { ExternalDocAdmissionInputV1 } from './external-doc-admission.js';

const input = (over: Partial<ExternalDocAdmissionInputV1['page']> = {}): ExternalDocAdmissionInputV1 => ({
	manifestRevision: 'm', sourceRevision: 's',
	page: { provider: 'p', product: 'q', productVersion: '1', architecture: null, language: null, url: 'https://example.test/a', title: 't', publisher: null, sourceAuthority: 'OFFICIAL', fetcher: 'f', crawlRevision: 'c', parserRevision: 'pr', contentHash: 'h1', evidenceRevision: 'pe1', retrievedAt: '2026-09-23T00:00:00Z', ...over },
	chunks: [0, 1].map((i) => ({ chunkId: `c${i}`, ordinal: i, headingPath: [], sectionAnchor: null, startChar: i * 5, endChar: i * 5 + 5, startByte: i * 5, endByte: i * 5 + 5, text: `text${i}`, domainClass: 'x', ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum: `ck${i}`, evidenceRevision: `ce${i}` }))
});
const liveFor = (e: ExternalDocAdmissionInputV1): LivePageState => ({
	page: { provider: 'p', product: 'q', product_version: '1', architecture: null, url: e.page.url, content_hash: e.page.contentHash, evidence_revision: e.page.evidenceRevision },
	chunks: e.chunks.map((c) => ({ chunk_id: c.chunkId, ordinal: c.ordinal, start_byte: String(c.startByte), end_byte: String(c.endByte), text: c.text, chunk_checksum: c.chunkChecksum, evidence_revision: c.evidenceRevision })),
	collidingChunkIds: []
});

describe('resumable admission planning (pure, no database)', () => {
	it('MISSING when nothing exists', () => {
		expect(classifyPageAdmission(input(), { page: null, chunks: [], collidingChunkIds: [] })).toEqual({ classification: 'MISSING', reasons: [] });
	});
	it('ALREADY_ADMITTED_EXACT only for an exact page + complete identical chunk set (bigint spans as strings are fine)', () => {
		const e = input();
		expect(classifyPageAdmission(e, liveFor(e)).classification).toBe('ALREADY_ADMITTED_EXACT');
	});
	it('CONFLICT (fail closed) for every kind of divergence', () => {
		const e = input();
		const mut = (fn: (l: LivePageState) => void) => { const l = liveFor(e); fn(l); return classifyPageAdmission(e, l); };
		expect(mut((l) => { l.chunks.pop(); }).reasons.join()).toMatch(/CHUNK_COUNT|CHUNK_MISSING/);
		expect(mut((l) => { l.chunks[0].text = 'changed'; }).reasons).toContain('CHUNK_TEXT:c0');
		expect(mut((l) => { l.chunks[1].chunk_checksum = 'zz'; }).reasons).toContain('CHUNK_CHECKSUM:c1');
		expect(mut((l) => { l.chunks[0].end_byte = 999; }).reasons).toContain('CHUNK_SPAN:c0');
		expect(mut((l) => { l.chunks[0].evidence_revision = 'other'; }).reasons).toContain('CHUNK_EVIDENCE_REVISION:c0');
		expect(mut((l) => { l.page!.content_hash = 'other'; }).reasons).toContain('PAGE_CONTENT_HASH');
		expect(mut((l) => { l.page!.product_version = '2'; }).reasons).toContain('PAGE_VERSION_IDENTITY');
		expect(mut((l) => { l.chunks.push({ ...l.chunks[0], chunk_id: 'extra', evidence_revision: 'ex', ordinal: 9 }); }).reasons.join()).toMatch(/UNEXPECTED_CHUNK:extra/);
		expect(classifyPageAdmission(e, { page: null, chunks: [], collidingChunkIds: ['c0'] }).classification).toBe('CONFLICT');
		expect(classifyPageAdmission(e, { page: null, chunks: liveFor(e).chunks, collidingChunkIds: [] }).reasons).toContain('CHUNKS_WITHOUT_PAGE');
		expect(classifyPageAdmission(e, { ...liveFor(e), pageCandidates: [liveFor(e).page!, { ...liveFor(e).page! }] }).reasons).toContain('DUPLICATE_PAGE_CANDIDATES:2');
		expect(classifyPageAdmission(e, { ...liveFor(e), pageCandidates: [{ ...liveFor(e).page!, evidence_revision: 'sha256:other' }] }).reasons).toContain('PAGE_EVIDENCE_REVISION');
	});
	it('a crash-after-page-N prefix is resumable: admitted pages skip, remaining pages are MISSING, no conflicts', () => {
		const pages = [1, 2, 3, 4].map((n) => input({ url: `https://example.test/${n}`, evidenceRevision: `pe${n}`, contentHash: `h${n}` }));
		// give each page unique chunk ids so classification is per page
		pages.forEach((p, n) => p.chunks.forEach((c) => { c.chunkId = `p${n}-${c.chunkId}`; c.evidenceRevision = `p${n}-${c.evidenceRevision}`; }));
		const items = pages.map((p, n) => ({ input: p, result: n < 2 ? classifyPageAdmission(p, liveFor(p)) : classifyPageAdmission(p, { page: null, chunks: [], collidingChunkIds: [] }) }));
		const plan = summarizePlan(items);
		expect([plan.alreadyAdmitted, plan.missing, plan.conflicts, plan.safeToAdmit]).toEqual([2, 2, 0, true]);
	});
	it('any conflict makes the plan unsafe', () => {
		const e = input(); const l = liveFor(e); l.chunks[0].text = 'x';
		expect(summarizePlan([{ input: e, result: classifyPageAdmission(e, l) }]).safeToAdmit).toBe(false);
	});
});

describe('loadLivePageState (fake pool, SELECT only)', () => {
	it('reads by exact page identity or revision and checks chunk collisions on every path', async () => {
		const e = input(); const l = liveFor(e);
		const seen: string[] = [];
		const pool = { async query(sql: string) {
			seen.push(sql.trimStart());
			if (/FROM atlas_external_doc_pages/.test(sql)) return { rows: [{ id: 'pg1', ...l.page }] };
			if (/WHERE page_id/.test(sql)) return { rows: l.chunks };
			return { rows: [] };
		} };
		const state = await loadLivePageState(pool as never, e);
		expect(classifyPageAdmission(e, state).classification).toBe('ALREADY_ADMITTED_EXACT');
		expect(seen.every((q) => /^SELECT/.test(q))).toBe(true);
		expect(seen).toHaveLength(3);
		expect(seen[0]).toContain('provider = $1 AND product = $2 AND product_version = $3 AND url = $4');
		const absent = { async query(sql: string) { return /chunk_id = ANY/.test(sql) ? { rows: [{ chunk_id: 'c0', page_id: 'other-page' }] } : { rows: [] }; } };
		expect(classifyPageAdmission(e, await loadLivePageState(absent as never, e)).classification).toBe('CONFLICT');
	});
});

describe('resumable writer orchestration (in-memory only)', () => {
	const cohort = () => ['A', 'B', 'C'].map((name) => {
		const value = input({ url: `https://example.test/${name}`, evidenceRevision: `page:${name}`, contentHash: `hash:${name}` });
		value.chunks.forEach((chunk) => { chunk.chunkId = `${name}:${chunk.chunkId}`; chunk.evidenceRevision = `${name}:${chunk.evidenceRevision}`; });
		return value;
	});

	it('skips two exact pages and invokes the writer only for the one missing page', async () => {
		const [a, b, c] = cohort();
		const live = new Map([[a.page.url, liveFor(a)], [b.page.url, liveFor(b)]]);
		const written: string[] = [];
		const run = await runResumableAdmissionV1([a, b, c], async (page) => live.get(page.page.url) ?? { page: null, chunks: [], collidingChunkIds: [] }, async (page) => {
			written.push(page.page.url); live.set(page.page.url, liveFor(page)); return `receipt:${page.page.url}`;
		});
		expect([run.plan.alreadyAdmitted, run.plan.missing, run.plan.conflicts]).toEqual([2, 1, 0]);
		expect(run.result).toBe('RESUMED');
		expect(run.writerCalls).toBe(1);
		expect(written).toEqual([c.page.url]);
		expect(run.plan.pages.map((page) => page.classification)).toEqual(['ALREADY_ADMITTED_EXACT', 'ALREADY_ADMITTED_EXACT', 'MISSING']);
	});

	it.each([
		['wrong page evidence revision', (s: LivePageState) => { s.page!.evidence_revision = 'other'; }],
		['missing child chunk', (s: LivePageState) => { s.chunks.pop(); }],
		['extra child chunk', (s: LivePageState) => { s.chunks.push({ ...s.chunks[0], chunk_id: 'extra', ordinal: 9 }); }],
		['wrong child checksum', (s: LivePageState) => { s.chunks[0].chunk_checksum = 'wrong'; }],
		['wrong child span', (s: LivePageState) => { s.chunks[0].end_byte = 999; }],
		['wrong child text', (s: LivePageState) => { s.chunks[0].text = 'wrong'; }],
		['chunk ID collision on another page', (s: LivePageState) => { s.collidingChunkIds.push('c0'); }],
		['duplicate page candidate', (s: LivePageState) => { s.pageCandidates = [s.page!, { ...s.page! }]; }],
	])('does not call the writer for %s', async (_name, change) => {
		const e = input(); const state = liveFor(e); (change as (s: LivePageState) => void)(state);
		let writerCalls = 0;
		const run = await runResumableAdmissionV1([e], async () => state, async () => { writerCalls += 1; return 'unexpected'; });
		expect(run.result).toBe('CONFLICT');
		expect(run.writerCalls).toBe(0);
		expect(writerCalls).toBe(0);
	});

	it('recovers a crash after A and B commit, then admits only missing C exactly once', async () => {
		const [a, b, c] = cohort();
		const live = new Map<string, LivePageState>();
		const firstRunWrites: string[] = [];
		await expect(runResumableAdmissionV1([a, b, c], async (page) => live.get(page.page.url) ?? { page: null, chunks: [], collidingChunkIds: [] }, async (page) => {
			firstRunWrites.push(page.page.url);
			if (page === c) throw new Error('SIMULATED_CRASH_BEFORE_C_COMMIT');
			live.set(page.page.url, liveFor(page));
			return `receipt:${page.page.url}`;
		})).rejects.toThrow('SIMULATED_CRASH_BEFORE_C_COMMIT');
		expect(firstRunWrites).toEqual([a.page.url, b.page.url, c.page.url]);
		const resumedWrites: string[] = [];
		const replay = await runResumableAdmissionV1([a, b, c], async (page) => live.get(page.page.url) ?? { page: null, chunks: [], collidingChunkIds: [] }, async (page) => {
			resumedWrites.push(page.page.url); live.set(page.page.url, liveFor(page)); return `receipt:${page.page.url}`;
		});
		expect([replay.plan.alreadyAdmitted, replay.plan.missing, replay.plan.conflicts]).toEqual([2, 1, 0]);
		expect(resumedWrites).toEqual([c.page.url]);
		expect(replay.writerCalls).toBe(1);
		expect(live.size).toBe(3);
	});
});
