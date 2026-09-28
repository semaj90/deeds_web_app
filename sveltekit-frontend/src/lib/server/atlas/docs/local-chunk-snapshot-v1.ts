import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const POINTER_RELATIVE_PATH = 'docs/.okf/topics/langchain/viewer-snapshot.json';
const MAX_CHUNK_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_PAGE_SIZE = 20;
const MAX_OFFSET = 100_000;

export interface LocalChunkSnapshotItemV1 {
	chunkId: string;
	evidenceRevision: string;
	product: string;
	canonicalUrl: string;
	headingPath: string[];
	ordinal: number;
	excerpt: string;
}

export interface LocalChunkSnapshotPageV1 {
	schema: 'atlas.local-doc-snapshot-page.v1';
	status: 'LOCAL_UNADMITTED' | 'SNAPSHOT_MISSING' | 'SNAPSHOT_INVALID' | 'MANIFEST_CHECKSUM_MISMATCH';
	corpusId: string | null;
	runId: string | null;
	corpusRevision: string | null;
	manifestChecksum: string | null;
	chunkCount: number | null;
	pageCount: number | null;
	failedPageCount: number | null;
	chunkManifestSha256: string | null;
	query: string;
	pagination: { offset: number; limit: number; total: number };
	chunks: LocalChunkSnapshotItemV1[];
	nextOffset: number | null;
	canonicalAuthority: false;
	writesPerformed: false;
	note: string | null;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function safeArtifactPath(root: string, relativePath: unknown): string | null {
	if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath)) return null;
	const base = resolve(root);
	const target = resolve(base, relativePath);
	const rel = relative(base, target).replace(/\\/g, '/');
	if (rel.startsWith('../') || rel === '..' || !rel.startsWith('.tmp/atlas/langchain-doc-corpus-v1/')) return null;
	return target;
}

function empty(status: LocalChunkSnapshotPageV1['status'], query: string, offset: number, limit: number, note: string | null, manifestChecksum: string | null = null): LocalChunkSnapshotPageV1 {
	return {
		schema: 'atlas.local-doc-snapshot-page.v1', status, corpusId: null, runId: null,
		corpusRevision: null, manifestChecksum,
		chunkCount: null, pageCount: null, failedPageCount: null, chunkManifestSha256: null,
		query, pagination: { offset, limit, total: 0 }, chunks: [], nextOffset: null, canonicalAuthority: false, writesPerformed: false, note
	};
}

/** Read-only viewer over one explicitly pinned, checksum-verified local chunk artifact. */
export function readLocalChunkSnapshotPageV1(input: { root: string; query?: string; offset?: number; limit?: number; expectedManifestChecksum?: string }): LocalChunkSnapshotPageV1 {
	const query = (input.query ?? '').trim().slice(0, 120);
	const offset = Number.isSafeInteger(input.offset) && (input.offset ?? 0) >= 0 ? Math.min(input.offset ?? 0, MAX_OFFSET) : 0;
	const limit = Number.isSafeInteger(input.limit) && (input.limit ?? 10) > 0 ? Math.min(input.limit ?? 10, MAX_PAGE_SIZE) : 10;
	const pointerFile = resolve(input.root, POINTER_RELATIVE_PATH);
	if (!existsSync(pointerFile)) return empty('SNAPSHOT_MISSING', query, offset, limit, 'No pinned local snapshot is configured.');

	try {
		const pointerBytes = readFileSync(pointerFile);
		const manifestChecksum = `sha256:${createHash('sha256').update(pointerBytes).digest('hex')}`;
		if (offset > 0 && !input.expectedManifestChecksum) {
			return empty('MANIFEST_CHECKSUM_MISMATCH', query, offset, limit, 'Paginated requests must pin the manifest checksum from page one.', manifestChecksum);
		}
		if (input.expectedManifestChecksum && input.expectedManifestChecksum !== manifestChecksum) {
			return empty('MANIFEST_CHECKSUM_MISMATCH', query, offset, limit, 'Pinned manifest changed; restart pagination from the current snapshot.', manifestChecksum);
		}
		const pointer = asObject(JSON.parse(pointerBytes.toString('utf8')));
		if (!pointer || pointer.schema !== 'atlas.local-doc-chunk-snapshot-pointer.v1' || pointer.canonicalAuthority !== false || pointer.artifactOnly !== true) {
			return empty('SNAPSHOT_INVALID', query, offset, limit, 'Snapshot pointer failed its noncanonical authority contract.', manifestChecksum);
		}
		const chunksPath = safeArtifactPath(input.root, pointer.chunksPath);
		const receiptPath = safeArtifactPath(input.root, pointer.receiptPath);
		if (!chunksPath || !receiptPath || !existsSync(chunksPath) || !existsSync(receiptPath)) {
			return empty('SNAPSHOT_MISSING', query, offset, limit, 'Pinned chunk artifact or receipt is missing.', manifestChecksum);
		}
		const size = statSync(chunksPath).size;
		if (size <= 0 || size > MAX_CHUNK_ARTIFACT_BYTES) return empty('SNAPSHOT_INVALID', query, offset, limit, 'Pinned artifact is empty or exceeds the 16 MiB viewer limit.', manifestChecksum);
		const bytes = readFileSync(chunksPath);
		const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		const receipt = asObject(JSON.parse(readFileSync(receiptPath, 'utf8')));
		if (!receipt || receipt.schema !== 'atlas.langchain-doc-chunk-receipt.v1' || receipt.canonicalAuthority !== false ||
			receipt.corpusId !== pointer.corpusId || receipt.chunkManifestSha256 !== pointer.chunkManifestSha256 || digest !== pointer.chunkManifestSha256) {
			return empty('SNAPSHOT_INVALID', query, offset, limit, 'Pinned receipt or chunk checksum does not match; no rows are displayed.', manifestChecksum);
		}
		const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => asObject(JSON.parse(line)));
		const expectedCount = Number(receipt.chunkCount);
		if (!Number.isSafeInteger(expectedCount) || rows.length !== expectedCount || rows.some((row) => !row || typeof row.chunk_id !== 'string' || typeof row.chunk_evidence_revision !== 'string' || typeof row.text !== 'string')) {
			return empty('SNAPSHOT_INVALID', query, offset, limit, 'Chunk JSONL count or row shape does not match its receipt.', manifestChecksum);
		}
		const stableRows = rows.sort((a, b) => {
			const left = `${a!.canonicalUrl ?? ''}\u0000${Array.isArray(a!.heading_path) ? a!.heading_path.join('\u0000') : ''}\u0000${String(a!.ordinal ?? '')}\u0000${a!.chunk_id}`;
			const right = `${b!.canonicalUrl ?? ''}\u0000${Array.isArray(b!.heading_path) ? b!.heading_path.join('\u0000') : ''}\u0000${String(b!.ordinal ?? '')}\u0000${b!.chunk_id}`;
			return left < right ? -1 : left > right ? 1 : 0;
		});
		const matching = stableRows.filter((row) => !query || `${row!.product ?? ''} ${row!.canonicalUrl ?? ''} ${Array.isArray(row!.heading_path) ? row!.heading_path.join(' ') : ''} ${row!.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
		const selected = matching.slice(offset, offset + limit).map((row) => ({
			chunkId: String(row!.chunk_id), evidenceRevision: String(row!.chunk_evidence_revision),
			product: String(row!.product ?? 'unknown'), canonicalUrl: String(row!.canonicalUrl ?? ''),
			headingPath: Array.isArray(row!.heading_path) ? row!.heading_path.filter((part): part is string => typeof part === 'string').slice(0, 12) : [],
			ordinal: Number.isSafeInteger(row!.ordinal) ? Number(row!.ordinal) : -1,
			excerpt: String(row!.text).slice(0, 900)
		}));
		return {
			schema: 'atlas.local-doc-snapshot-page.v1', status: 'LOCAL_UNADMITTED',
			corpusId: String(pointer.corpusId), runId: String(pointer.runId), chunkCount: rows.length,
			corpusRevision: String(pointer.chunkManifestSha256), manifestChecksum,
			pageCount: Number(receipt.scopeAdmittedPageCount), failedPageCount: Number(receipt.failedPageCount),
			chunkManifestSha256: digest, query, pagination: { offset, limit, total: matching.length }, chunks: selected,
			nextOffset: offset + selected.length < matching.length ? offset + selected.length : null,
			canonicalAuthority: false, writesPerformed: false,
			note: 'Local checksum-verified artifact only; not admitted to PostgreSQL and not canonical evidence.'
		};
	} catch {
		return empty('SNAPSHOT_INVALID', query, offset, limit, 'Pinned snapshot could not be parsed safely.');
	}
}
