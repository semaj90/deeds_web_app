import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const h = vi.hoisted(() => ({ query: vi.fn(), getAuthorizedCase: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: h.query } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: h.getAuthorizedCase }));

import {
	createLibraryCitationContextManifestV1,
	resolveLibraryCitationProvenanceV1,
	verifyLibraryCitationReferencesV1,
} from './library-citation-provenance-v1.js';

const CASE_ID = '44444444-4444-4444-8444-444444444444';
const CHUNK_ID = '11111111-1111-4111-8111-111111111111';
const QUOTE = 'Authorized source text with a verified page span.';
const QUOTE_HASH = createHash('sha256').update(QUOTE, 'utf8').digest('hex');

describe('revision-qualified library citation provenance v1', () => {
	beforeEach(() => {
		h.query.mockReset();
		h.getAuthorizedCase.mockReset();
	});

	it('returns citation spans only from the authorized actor and current source version', async () => {
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		h.query.mockResolvedValue({ rows: [{
			chunk_id: CHUNK_ID,
			document_id: '22222222-2222-4222-8222-222222222222',
			chunk_hash: QUOTE_HASH,
			title: 'Canonical document title',
			source_hash: 'a'.repeat(64),
			document_revision: '33333333-3333-4333-8333-333333333333',
			parser_revision: 'pdf-parse-v2;chunker-v1',
			page_start: 2,
			page_end: 2,
			char_start: 100,
			char_end: 140,
			char_offset_unit: 'utf16_code_units',
			chunk_text: QUOTE,
		}] });

		const result = await resolveLibraryCitationProvenanceV1({
			actorId: '7', caseId: CASE_ID, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		});
		expect(result.get(1)).toMatchObject({
			chunkId: CHUNK_ID,
			documentTitle: 'Canonical document title',
			sourceHash: 'a'.repeat(64),
			chunkHash: QUOTE_HASH,
			documentRevision: '33333333-3333-4333-8333-333333333333',
			parserRevision: 'pdf-parse-v2;chunker-v1',
			pageStart: 2,
			charStart: 100,
			charEnd: 140,
			charOffsetUnit: 'utf16_code_units',
		});
		const [sql, params] = h.query.mock.calls[0] as [string, unknown[]];
		expect(sql).toContain('ldv.source_hash = ld.source_hash');
		expect(sql).toContain('ldv.is_current IS TRUE');
		expect(sql).toContain('ld.uploaded_by = $2::integer');
		expect(sql).toContain('case_library_links');
		expect(params).toEqual([[CHUNK_ID], 7, CASE_ID]);
	});

	it('does not query chunks when case authorization fails', async () => {
		h.getAuthorizedCase.mockResolvedValue(null);
		await expect(resolveLibraryCitationProvenanceV1({
			actorId: '7', caseId: CASE_ID, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		})).resolves.toEqual(new Map());
		expect(h.query).not.toHaveBeenCalled();
	});

	it('fails closed before querying when prompt ordinals are duplicated', async () => {
		const otherChunkId = '55555555-5555-4555-8555-555555555555';
		await expect(resolveLibraryCitationProvenanceV1({
			actorId: 7,
			candidates: [
				{ ordinal: 1, chunkId: CHUNK_ID },
				{ ordinal: 1, chunkId: otherChunkId },
			],
		})).resolves.toEqual(new Map());
		expect(h.query).not.toHaveBeenCalled();
	});

	it('rejects missing parser provenance, invalid hashes and malformed spans', async () => {
		h.query.mockResolvedValue({ rows: [
			{ chunk_id: CHUNK_ID, document_id: 'd', source_hash: 'bad', chunk_hash: '0'.repeat(64), document_revision: 'r', parser_revision: '', char_start: 0, char_end: 5, char_offset_unit: 'utf16_code_units', chunk_text: 'bad' },
		] });
		await expect(resolveLibraryCitationProvenanceV1({
			actorId: 7, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		})).resolves.toEqual(new Map());
	});

	it('rejects a chunk whose stored text no longer matches its content hash', async () => {
		h.query.mockResolvedValue({ rows: [{
			chunk_id: CHUNK_ID,
			document_id: '22222222-2222-4222-8222-222222222222',
			title: 'Canonical document title',
			source_hash: 'a'.repeat(64),
			chunk_hash: '0'.repeat(64),
			document_revision: '33333333-3333-4333-8333-333333333333',
			parser_revision: 'pdf-parse-v2;chunker-v1',
			page_start: 1,
			page_end: 1,
			char_start: 0,
			char_end: QUOTE.length,
			char_offset_unit: 'utf16_code_units',
			chunk_text: QUOTE,
		}] });
		await expect(resolveLibraryCitationProvenanceV1({
			actorId: 7, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		})).resolves.toEqual(new Map());
	});

	it('binds citation verification to the pre-generation manifest and exact prompt ordinal', async () => {
		h.getAuthorizedCase.mockResolvedValue({ id: CASE_ID });
		h.query.mockResolvedValue({ rows: [{
			chunk_id: CHUNK_ID,
			document_id: '22222222-2222-4222-8222-222222222222',
			chunk_hash: QUOTE_HASH,
			title: 'Canonical document title',
			source_hash: 'a'.repeat(64),
			document_revision: '33333333-3333-4333-8333-333333333333',
			parser_revision: 'pdf-parse-v2;chunker-v1',
			page_start: 2,
			page_end: 2,
			char_start: 100,
			char_end: 140,
			char_offset_unit: 'utf16_code_units',
			chunk_text: QUOTE,
		}] });

		const manifest = await createLibraryCitationContextManifestV1({
			actorId: '7', caseId: CASE_ID, candidates: [{ ordinal: 3, chunkId: CHUNK_ID }],
		});
		expect(manifest).toMatchObject({ schema: 'atlas.library-citation-context.v1', actorId: 7, caseId: CASE_ID });
		expect(manifest?.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(verifyLibraryCitationReferencesV1(manifest, [{ ordinal: 3, chunkId: CHUNK_ID }]).get(3)?.sourceHash).toBe('a'.repeat(64));
		expect(verifyLibraryCitationReferencesV1(manifest, [{ ordinal: 2, chunkId: CHUNK_ID }])).toEqual(new Map());
		expect(verifyLibraryCitationReferencesV1(manifest, [{ ordinal: 3, chunkId: '44444444-4444-4444-8444-444444444444' }])).toEqual(new Map());
	});

	it('rejects a changed manifest after generation', async () => {
		h.query.mockResolvedValue({ rows: [{
			chunk_id: CHUNK_ID,
			document_id: '22222222-2222-4222-8222-222222222222',
			chunk_hash: QUOTE_HASH,
			title: 'Canonical document title',
			source_hash: 'a'.repeat(64),
			document_revision: '33333333-3333-4333-8333-333333333333',
			parser_revision: 'pdf-parse-v2;chunker-v1',
			page_start: 2,
			page_end: 2,
			char_start: 100,
			char_end: 140,
			char_offset_unit: 'utf16_code_units',
			chunk_text: QUOTE,
		}] });
		const manifest = await createLibraryCitationContextManifestV1({
			actorId: 7, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		});
		const entry = manifest?.entries.get(1);
		if (!manifest || !entry) throw new Error('fixture manifest missing');
		manifest.entries.set(1, { ...entry, sourceHash: 'b'.repeat(64) });
		expect(verifyLibraryCitationReferencesV1(manifest, [{ ordinal: 1, chunkId: CHUNK_ID }])).toEqual(new Map());
	});

	it.each(['quote', 'documentTitle'] as const)('rejects a post-generation %s mutation', async (field) => {
		h.query.mockResolvedValue({ rows: [{
			chunk_id: CHUNK_ID,
			document_id: '22222222-2222-4222-8222-222222222222',
			chunk_hash: QUOTE_HASH,
			title: 'Canonical document title',
			source_hash: 'a'.repeat(64),
			document_revision: '33333333-3333-4333-8333-333333333333',
			parser_revision: 'pdf-parse-v2;chunker-v1',
			page_start: 2,
			page_end: 2,
			char_start: 100,
			char_end: 140,
			char_offset_unit: 'utf16_code_units',
			chunk_text: QUOTE,
		}] });
		const manifest = await createLibraryCitationContextManifestV1({
			actorId: 7, candidates: [{ ordinal: 1, chunkId: CHUNK_ID }],
		});
		const entry = manifest?.entries.get(1);
		if (!manifest || !entry) throw new Error('fixture manifest missing');
		manifest.entries.set(1, {
			...entry,
			[field]: field === 'quote' ? 'tampered citation text' : 'tampered source title',
		});
		expect(verifyLibraryCitationReferencesV1(manifest, [{ ordinal: 1, chunkId: CHUNK_ID }])).toEqual(new Map());
	});
});
