import { createHash } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { normalizeLibraryActorIdV1 } from './library-document-access-v1.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

export interface LibraryCitationCandidateV1 {
	ordinal: number;
	chunkId: string;
}

export interface VerifiedLibraryCitationV1 extends LibraryCitationCandidateV1 {
	documentId: string;
	documentTitle: string;
	sourceHash: string;
	documentRevision: string;
	parserRevision: string;
	pageStart: number | null;
	pageEnd: number | null;
	charStart: number;
	charEnd: number;
	charOffsetUnit: 'utf16_code_units';
	chunkHash: string;
	quote: string;
}

export interface LibraryCitationContextManifestV1 {
	schema: 'atlas.library-citation-context.v1';
	actorId: number;
	caseId: string | null;
	manifestSha256: string;
	entries: ReadonlyMap<number, VerifiedLibraryCitationV1>;
}

function libraryCitationManifestDigestV1(
	actorId: number,
	caseId: string | null,
	entries: Iterable<VerifiedLibraryCitationV1>,
): string {
	const stableEntries = [...entries]
		.sort((a, b) => a.ordinal - b.ordinal)
		.map((entry) => ({
			ordinal: entry.ordinal,
			chunkId: entry.chunkId,
			documentId: entry.documentId,
			documentTitle: entry.documentTitle,
			sourceHash: entry.sourceHash.toLowerCase(),
			documentRevision: entry.documentRevision,
			parserRevision: entry.parserRevision,
			pageStart: entry.pageStart,
			pageEnd: entry.pageEnd,
			charStart: entry.charStart,
			charEnd: entry.charEnd,
			charOffsetUnit: entry.charOffsetUnit,
			chunkHash: entry.chunkHash.toLowerCase(),
			quote: entry.quote,
		}));
	return createHash('sha256')
		.update(JSON.stringify({ schema: 'atlas.library-citation-context.v1', actorId, caseId, entries: stableEntries }), 'utf8')
		.digest('hex');
}

/** Resolves citation IDs against current, actor-visible PostgreSQL source rows. */
export async function resolveLibraryCitationProvenanceV1(input: {
	actorId: unknown;
	caseId?: string | null;
	candidates: readonly LibraryCitationCandidateV1[];
}): Promise<Map<number, VerifiedLibraryCitationV1>> {
	const actorId = normalizeLibraryActorIdV1(input.actorId);
	if (actorId === null || input.candidates.length === 0) return new Map();
	if (input.caseId) {
		if (!UUID_RE.test(input.caseId)) return new Map();
		const authorizedCase = await getAuthorizedCase(input.caseId, actorId).catch(() => null);
		if (!authorizedCase) return new Map();
	}
	const candidates = input.candidates.filter((candidate) => Number.isSafeInteger(candidate.ordinal) && candidate.ordinal > 0 && UUID_RE.test(candidate.chunkId));
	const ordinals = candidates.map((candidate) => candidate.ordinal);
	if (new Set(ordinals).size !== ordinals.length) return new Map();
	const chunkIds = [...new Set(candidates.map((candidate) => candidate.chunkId))];
	if (!chunkIds.length) return new Map();
	const params: unknown[] = [chunkIds, actorId];
	const caseFilter = input.caseId ? 'AND EXISTS (SELECT 1 FROM case_library_links cl WHERE cl.document_id = ld.id AND cl.case_id = $3::uuid)' : '';
	if (input.caseId) params.push(input.caseId);
	const result = await pool.query(
		`SELECT lc.id::text AS chunk_id, lc.chunk_hash, ld.id::text AS document_id, ld.source_hash,
		        ldv.id::text AS document_revision, lc.parser_revision,
		        lc.page_start, lc.page_end, lc.char_start, lc.char_end, lc.char_offset_unit, lc.chunk_text, ld.title
		 FROM legal_chunks lc
		 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		 JOIN library_documents ld ON ld.id = ln.document_id
	 JOIN library_document_versions ldv
	   ON ldv.id = ln.version_id AND ldv.document_id = ld.id
	  AND ldv.source_hash = ld.source_hash AND ldv.is_current IS TRUE
		 WHERE lc.id = ANY($1::uuid[])
		   AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $2::integer)
		   AND lc.parser_revision IS NOT NULL
		   AND ld.source_hash ~ '^[a-fA-F0-9]{64}$'
		   ${caseFilter}`,
		params,
	);
	const rowById = new Map<string, Record<string, unknown>>();
	for (const row of result.rows as Array<Record<string, unknown>>) rowById.set(String(row['chunk_id']), row);
	const verified = new Map<number, VerifiedLibraryCitationV1>();
	for (const candidate of candidates) {
		const row = rowById.get(candidate.chunkId);
		if (!row) continue;
		const sourceHash = String(row['source_hash'] ?? '');
		const parserRevision = String(row['parser_revision'] ?? '').trim();
		const charStart = Number(row['char_start']);
		const charEnd = Number(row['char_end']);
		const charOffsetUnit = String(row['char_offset_unit'] ?? '');
		const pageStart = row['page_start'] === null ? null : Number(row['page_start']);
		const pageEnd = row['page_end'] === null ? null : Number(row['page_end']);
		const quote = String(row['chunk_text'] ?? '');
		const chunkHash = String(row['chunk_hash'] ?? '').toLowerCase();
		const actualChunkHash = createHash('sha256').update(quote, 'utf8').digest('hex');
		if (!SHA256_RE.test(sourceHash) || !SHA256_RE.test(chunkHash) || chunkHash !== actualChunkHash || !parserRevision || charOffsetUnit !== 'utf16_code_units' || !Number.isSafeInteger(charStart) || !Number.isSafeInteger(charEnd) || charStart < 0 || charEnd <= charStart || !quote) continue;
		if ((pageStart !== null && (!Number.isSafeInteger(pageStart) || pageStart < 1)) || (pageEnd !== null && (!Number.isSafeInteger(pageEnd) || pageEnd < (pageStart ?? 1)))) continue;
		verified.set(candidate.ordinal, {
			ordinal: candidate.ordinal,
			chunkId: candidate.chunkId,
			documentId: String(row['document_id']),
			documentTitle: String(row['title'] ?? ''),
			sourceHash,
			documentRevision: String(row['document_revision']),
			parserRevision,
			pageStart,
			pageEnd,
			charStart,
			charEnd,
			charOffsetUnit: 'utf16_code_units',
			chunkHash,
			quote: quote.slice(0, 1000),
		});
	}
	return verified;
}

/** Captures the exact authorized source revisions before synthesis begins. */
export async function createLibraryCitationContextManifestV1(input: {
	actorId: unknown;
	caseId?: string | null;
	candidates: readonly LibraryCitationCandidateV1[];
}): Promise<LibraryCitationContextManifestV1 | null> {
	const actorId = normalizeLibraryActorIdV1(input.actorId);
	if (actorId === null) return null;
	const entries = await resolveLibraryCitationProvenanceV1(input);
	const caseId = input.caseId ?? null;
	const manifestSha256 = libraryCitationManifestDigestV1(actorId, caseId, entries.values());
	return {
		schema: 'atlas.library-citation-context.v1',
		actorId,
		caseId,
		manifestSha256,
		entries,
	};
}

/** Verifies model references against the pre-generation manifest, without a post-generation DB race. */
export function verifyLibraryCitationReferencesV1(
	manifest: LibraryCitationContextManifestV1 | null,
	references: readonly LibraryCitationCandidateV1[],
): Map<number, VerifiedLibraryCitationV1> {
	const verified = new Map<number, VerifiedLibraryCitationV1>();
	if (
		!manifest ||
		manifest.schema !== 'atlas.library-citation-context.v1' ||
		!Number.isSafeInteger(manifest.actorId) ||
		!/^[0-9a-f]{64}$/.test(manifest.manifestSha256) ||
		libraryCitationManifestDigestV1(manifest.actorId, manifest.caseId, manifest.entries.values()) !== manifest.manifestSha256
	) return verified;
	for (const reference of references) {
		if (!Number.isSafeInteger(reference.ordinal) || reference.ordinal < 1) continue;
		const entry = manifest.entries.get(reference.ordinal);
		if (entry?.chunkId === reference.chunkId) verified.set(reference.ordinal, entry);
	}
	return verified;
}
