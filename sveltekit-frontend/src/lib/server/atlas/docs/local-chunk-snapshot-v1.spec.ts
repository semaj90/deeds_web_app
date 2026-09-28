// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLocalChunkSnapshotPageV1 } from './local-chunk-snapshot-v1.js';

let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

function fixture(rows: Record<string, unknown>[], over: Record<string, unknown> = {}) {
	root = mkdtempSync(join(tmpdir(), 'local-doc-snapshot-'));
	const folder = join(root, '.tmp', 'atlas', 'langchain-doc-corpus-v1', 'run', 'chunks-v1-streaming');
	mkdirSync(folder, { recursive: true });
	const bytes = Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
	const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
	writeFileSync(join(folder, 'chunks.jsonl'), bytes);
	writeFileSync(join(folder, 'receipt.json'), JSON.stringify({
		schema: 'atlas.langchain-doc-chunk-receipt.v1', corpusId: 'fixture-corpus', canonicalAuthority: false,
		chunkManifestSha256: digest, chunkCount: rows.length, scopeAdmittedPageCount: 1, failedPageCount: 0
	}));
	const pointerDir = join(root, 'docs', '.okf', 'topics', 'langchain');
	mkdirSync(pointerDir, { recursive: true });
	const pointerPath = join(pointerDir, 'viewer-snapshot.json');
	const pointerBytes = Buffer.from(JSON.stringify({
		schema: 'atlas.local-doc-chunk-snapshot-pointer.v1', corpusId: 'fixture-corpus', runId: 'run',
		chunksPath: '.tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/chunks.jsonl',
		receiptPath: '.tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/receipt.json',
		chunkManifestSha256: digest, canonicalAuthority: false, artifactOnly: true, ...over
	}));
	writeFileSync(pointerPath, pointerBytes);
	return { bytes, pointer: pointerPath, manifestChecksum: `sha256:${createHash('sha256').update(pointerBytes).digest('hex')}` };
}

const row = (chunkId: string, text: string) => ({
	schema: 'atlas.external-doc-chunk.v1', chunk_id: chunkId, chunk_evidence_revision: `sha256:${chunkId}`,
	product: 'langgraph', canonicalUrl: 'https://docs.example/page', heading_path: ['Persistence'], ordinal: 3, text
});

describe('local chunk snapshot viewer', () => {
	it('shows bounded pages only after checksum and receipt verification', () => {
		fixture([row('c1', 'Checkpoint persistence'), row('c2', 'Tool calling')]);
		const result = readLocalChunkSnapshotPageV1({ root, query: 'checkpoint', limit: 1 });
		expect(result).toMatchObject({ schema: 'atlas.local-doc-snapshot-page.v1', status: 'LOCAL_UNADMITTED', canonicalAuthority: false, writesPerformed: false, chunkCount: 2, pageCount: 1, pagination: { offset: 0, limit: 1, total: 1 } });
		expect(result.chunks).toHaveLength(1);
		expect(result.chunks[0]).toMatchObject({ chunkId: 'c1', product: 'langgraph', excerpt: 'Checkpoint persistence' });
		expect(result.manifestChecksum).toMatch(/^sha256:/);
		expect(result.note).toContain('not admitted to PostgreSQL');
	});

	it('paginates deterministically and caps page size', () => {
		const { manifestChecksum } = fixture([row('c1', 'one'), row('c2', 'two'), row('c3', 'three')]);
		const result = readLocalChunkSnapshotPageV1({ root, offset: 1, limit: 999, expectedManifestChecksum: manifestChecksum });
		expect(result.chunks.map((item) => item.chunkId)).toEqual(['c2', 'c3']);
		expect(result.pagination.limit).toBe(20);
		expect(result.nextOffset).toBeNull();
	});

	it('rejects later pages without the first page manifest checksum', () => {
		fixture([row('c1', 'one'), row('c2', 'two')]);
		expect(readLocalChunkSnapshotPageV1({ root, offset: 1 }).status).toBe('MANIFEST_CHECKSUM_MISMATCH');
	});

	it('rejects pagination when the pinned manifest changes between pages', () => {
		const { manifestChecksum, pointer } = fixture([row('c1', 'one'), row('c2', 'two')]);
		writeFileSync(pointer, Buffer.from('{"schema":"atlas.local-doc-chunk-snapshot-pointer.v1","corpusId":"other","runId":"new","chunksPath":".tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/chunks.jsonl","receiptPath":".tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/receipt.json","chunkManifestSha256":"sha256:wrong","canonicalAuthority":false,"artifactOnly":true}'));
		const result = readLocalChunkSnapshotPageV1({ root, offset: 1, expectedManifestChecksum: manifestChecksum });
		expect(result.status).toBe('MANIFEST_CHECKSUM_MISMATCH');
		expect(result.chunks).toEqual([]);
	});

	it('fails closed when the artifact digest is changed', () => {
		const { pointer } = fixture([row('c1', 'one')]);
		writeFileSync(pointer, JSON.stringify({ schema: 'atlas.local-doc-chunk-snapshot-pointer.v1', corpusId: 'fixture-corpus', runId: 'run', chunksPath: '.tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/chunks.jsonl', receiptPath: '.tmp/atlas/langchain-doc-corpus-v1/run/chunks-v1-streaming/receipt.json', chunkManifestSha256: 'sha256:wrong', canonicalAuthority: false, artifactOnly: true }));
		expect(readLocalChunkSnapshotPageV1({ root }).status).toBe('SNAPSHOT_INVALID');
	});

	it('rejects a pointer that escapes the approved local artifact root', () => {
		fixture([row('c1', 'one')], { chunksPath: '../../outside.jsonl' });
		expect(readLocalChunkSnapshotPageV1({ root }).status).toBe('SNAPSHOT_MISSING');
	});
});
