/**
 * Resumable first-load planning for the canonical external-doc corpus (EXTERNAL_DOC_ADMISSION_RUNNER_RESUMABLE_01).
 *
 * admitExternalDocPage commits one page per transaction, so a crash can leave a valid PARTIAL corpus. Instead of "tables must be empty", each expected
 * page is classified from an exact live readback:
 *   ALREADY_ADMITTED_EXACT - page row and its complete chunk set equal the expected envelope (identity, checksum, byte span, text): skip, never rewrite
 *   MISSING          - no page row and none of its chunk ids/evidence revisions exist: admit through the existing writer (no second SQL owner)
 *   CONFLICT         - anything else (different page fields, missing/extra/different chunks, orphan chunk ids): fail closed, mutate nothing
 * Pure and read-only except `loadLivePageState`, which only SELECTs.
 */
import type { Pool } from 'pg';
import type { ExternalDocAdmissionInputV1 } from './external-doc-admission.js';

export type PageAdmissionClass = 'ALREADY_ADMITTED_EXACT' | 'MISSING' | 'CONFLICT';

export interface LivePageRow {
	provider: string; product: string; product_version: string; architecture: string | null; url: string; content_hash: string; evidence_revision: string;
}
export interface LiveChunkRow {
	chunk_id: string; ordinal: number | string; start_byte: number | string; end_byte: number | string; text: string; chunk_checksum: string; evidence_revision: string;
}
export interface LivePageState {
	page: LivePageRow | null;
	/** All rows matching exact page identity OR the expected evidence revision. */
	pageCandidates?: LivePageRow[];
	pageId?: string | null;
	/** chunks attached to that page (empty when page is null) */
	chunks: LiveChunkRow[];
	/** chunk rows anywhere in the table whose chunk_id or evidence_revision equals one of the expected chunks (catches orphans / other-page collisions) */
	collidingChunkIds: string[];
}
export interface PageAdmissionClassification { classification: PageAdmissionClass; reasons: string[] }

export function classifyPageAdmission(expected: ExternalDocAdmissionInputV1, live: LivePageState): PageAdmissionClassification {
	const reasons: string[] = [];
	const candidates = live.pageCandidates ?? (live.page ? [live.page] : []);
	if (candidates.length > 1) reasons.push(`DUPLICATE_PAGE_CANDIDATES:${candidates.length}`);
	if (candidates.length === 0) {
		if (live.chunks.length > 0) reasons.push('CHUNKS_WITHOUT_PAGE');
		if (live.collidingChunkIds.length > 0) reasons.push(`CHUNK_IDENTITY_ALREADY_PRESENT:${live.collidingChunkIds.length}`);
		return reasons.length ? { classification: 'CONFLICT', reasons } : { classification: 'MISSING', reasons: [] };
	}
	const p = candidates[0]; const e = expected.page;
	if (p.evidence_revision !== e.evidenceRevision) reasons.push('PAGE_EVIDENCE_REVISION');
	if (p.url !== e.url) reasons.push('PAGE_URL');
	if (p.content_hash !== e.contentHash) reasons.push('PAGE_CONTENT_HASH');
	if (p.provider !== e.provider || p.product !== e.product || p.product_version !== e.productVersion || (p.architecture ?? null) !== (e.architecture ?? null)) reasons.push('PAGE_VERSION_IDENTITY');
	if (live.chunks.length !== expected.chunks.length) reasons.push(`CHUNK_COUNT:${live.chunks.length}!=${expected.chunks.length}`);
	const byId = new Map(live.chunks.map((c) => [c.chunk_id, c]));
	if (byId.size !== live.chunks.length) reasons.push('DUPLICATE_LIVE_CHUNK_ID');
	if (new Set(expected.chunks.map((c) => c.chunkId)).size !== expected.chunks.length) reasons.push('DUPLICATE_EXPECTED_CHUNK_ID');
	for (const c of expected.chunks) {
		const row = byId.get(c.chunkId);
		if (!row) { reasons.push(`CHUNK_MISSING:${c.chunkId}`); continue; }
		if (row.evidence_revision !== c.evidenceRevision) reasons.push(`CHUNK_EVIDENCE_REVISION:${c.chunkId}`);
		if (Number(row.ordinal) !== c.ordinal) reasons.push(`CHUNK_ORDINAL:${c.chunkId}`);
		if (row.chunk_checksum !== c.chunkChecksum) reasons.push(`CHUNK_CHECKSUM:${c.chunkId}`);
		if (Number(row.start_byte) !== c.startByte || Number(row.end_byte) !== c.endByte) reasons.push(`CHUNK_SPAN:${c.chunkId}`);
		if (row.text !== c.text) reasons.push(`CHUNK_TEXT:${c.chunkId}`);
	}
	const expectedIds = new Set(expected.chunks.map((c) => c.chunkId));
	for (const row of live.chunks) if (!expectedIds.has(row.chunk_id)) reasons.push(`UNEXPECTED_CHUNK:${row.chunk_id}`);
	if (live.collidingChunkIds.length > 0) reasons.push(`CHUNK_IDENTITY_COLLISION:${live.collidingChunkIds.length}`);
	return reasons.length ? { classification: 'CONFLICT', reasons } : { classification: 'ALREADY_ADMITTED_EXACT', reasons: [] };
}

/** Read-only exact readback of one expected page's live state. */
export async function loadLivePageState(pool: Pick<Pool, 'query'>, expected: ExternalDocAdmissionInputV1): Promise<LivePageState> {
	const pageRes = await pool.query(
		`SELECT id, provider, product, product_version, architecture, url, content_hash, evidence_revision
		 FROM atlas_external_doc_pages
		 WHERE (provider = $1 AND product = $2 AND product_version = $3 AND url = $4)
		    OR evidence_revision = $5`,
		[expected.page.provider, expected.page.product, expected.page.productVersion, expected.page.url, expected.page.evidenceRevision]
	);
	const pageCandidates = pageRes.rows as (LivePageRow & { id: string })[];
	const page = pageCandidates[0] ?? null;
	const chunks = page && pageCandidates.length === 1
		? ((await pool.query(
			`SELECT chunk_id, ordinal, start_byte, end_byte, text, chunk_checksum, evidence_revision
			 FROM atlas_external_doc_chunks WHERE page_id = $1 ORDER BY ordinal`, [page.id]
		)).rows as LiveChunkRow[])
		: [];
	const ids = expected.chunks.map((c) => c.chunkId);
	const revs = expected.chunks.map((c) => c.evidenceRevision);
	const collisionRows = (await pool.query(
		`SELECT chunk_id, page_id FROM atlas_external_doc_chunks WHERE chunk_id = ANY($1::text[]) OR evidence_revision = ANY($2::text[])`, [ids, revs]
	)).rows as { chunk_id: string; page_id: string }[];
	const colliding = collisionRows.filter((r) => !page || r.page_id !== page.id).map((r) => r.chunk_id);
	return { page, pageCandidates, pageId: page?.id ?? null, chunks, collidingChunkIds: colliding };
}

export interface AdmissionPlanV1 {
	alreadyAdmitted: number; missing: number; conflicts: number;
	pages: { url: string; classification: PageAdmissionClass; reasons: string[] }[];
	/** true when it is safe to start writing: no conflicts. */
	safeToAdmit: boolean;
}

export function summarizePlan(items: { input: ExternalDocAdmissionInputV1; result: PageAdmissionClassification }[]): AdmissionPlanV1 {
	const pages = items.map(({ input, result }) => ({ url: input.page.url, classification: result.classification, reasons: result.reasons }));
	const count = (c: PageAdmissionClass) => pages.filter((p) => p.classification === c).length;
	return { alreadyAdmitted: count('ALREADY_ADMITTED_EXACT'), missing: count('MISSING'), conflicts: count('CONFLICT'), pages, safeToAdmit: count('CONFLICT') === 0 };
}

export interface ResumableAdmissionRunV1<TReceipt> {
	result: 'RESUMED' | 'CONFLICT';
	plan: AdmissionPlanV1;
	writerCalls: number;
	receipts: TReceipt[];
}

/** Preflights the complete cohort, writes only missing pages through the supplied existing owner, and verifies each page immediately. */
export async function runResumableAdmissionV1<TReceipt>(
	inputs: ExternalDocAdmissionInputV1[],
	read: (input: ExternalDocAdmissionInputV1) => Promise<LivePageState>,
	write: (input: ExternalDocAdmissionInputV1) => Promise<TReceipt>,
): Promise<ResumableAdmissionRunV1<TReceipt>> {
	const planned = await Promise.all(inputs.map(async (input) => ({ input, result: classifyPageAdmission(input, await read(input)) })));
	const plan = summarizePlan(planned);
	if (!plan.safeToAdmit) return { result: 'CONFLICT', plan, writerCalls: 0, receipts: [] };
	const receipts: TReceipt[] = [];
	let writerCalls = 0;
	for (const item of planned) {
		if (item.result.classification === 'ALREADY_ADMITTED_EXACT') continue;
		writerCalls += 1;
		const receipt = await write(item.input);
		const readback = classifyPageAdmission(item.input, await read(item.input));
		if (readback.classification !== 'ALREADY_ADMITTED_EXACT') {
			throw new Error(`ADMISSION_POST_WRITE_READBACK_NOT_EXACT:${item.input.page.url}:${readback.reasons.join(',')}`);
		}
		receipts.push(receipt);
	}
	return { result: 'RESUMED', plan, writerCalls, receipts };
}
