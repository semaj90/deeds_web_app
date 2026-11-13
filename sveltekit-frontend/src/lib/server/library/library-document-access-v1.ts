/**
 * Library document authorization (v1) — the single owner for "may this actor read this
 * library document (source bytes, chunks, search hits, synthesis context)?".
 *
 * Rules:
 *  - `library_documents.uploaded_by IS NULL` = official/shared corpus: any signed-in actor.
 *  - `uploaded_by = <id>` = private upload: that actor only.
 *  - When a request is scoped to a case, `getAuthorizedCase` (owner or assigned attorney)
 *    must pass FIRST. A case denial never reaches the document query.
 * Callers must treat every deny reason as a non-disclosing 404 and make zero storage,
 * chunk, cache, retrieval or model calls after a deny.
 */
import { pool } from '$lib/server/db/client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LibraryAccessDenyReasonV1 =
	| 'INVALID_ACTOR'
	| 'INVALID_DOCUMENT_ID'
	| 'CASE_DENIED'
	| 'DOCUMENT_NOT_FOUND'
	| 'DOCUMENT_NOT_OWNED';

export type LibraryAccessDecisionV1 =
	| { allowed: true; documentId: string; scope: 'shared' | 'owner'; actorId: number; sourceHash: string | null; revisionId: string | null }
	| { allowed: false; reason: LibraryAccessDenyReasonV1 };

/** Lucia ids are strings, `uploaded_by` is an integer: compare as numbers, never `!==`. */
export function normalizeLibraryActorIdV1(value: unknown): number | null {
	const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
	return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function authorizeLibraryDocumentV1(input: {
	documentId: string;
	actorId: unknown;
	caseId?: string | null;
}): Promise<LibraryAccessDecisionV1> {
	const actorId = normalizeLibraryActorIdV1(input.actorId);
	if (actorId === null) return { allowed: false, reason: 'INVALID_ACTOR' };
	if (!UUID_RE.test(input.documentId)) return { allowed: false, reason: 'INVALID_DOCUMENT_ID' };

	if (input.caseId) {
		const authorizedCase = await getAuthorizedCase(input.caseId, actorId).catch(() => null);
		if (!authorizedCase) return { allowed: false, reason: 'CASE_DENIED' };
	}

	const params: unknown[] = [input.documentId, actorId];
	const caseScope = input.caseId ? `AND EXISTS (
		SELECT 1 FROM case_library_links cl
		WHERE cl.document_id = ld.id AND cl.case_id = $3::uuid
	)` : '';
	if (input.caseId) params.push(input.caseId);
	const res = await pool
		.query(`SELECT ld.uploaded_by, ld.source_hash, current_version.id AS revision_id
			FROM library_documents ld
			LEFT JOIN LATERAL (
				SELECT v.id FROM library_document_versions v
				WHERE v.document_id = ld.id
				  AND v.source_hash = ld.source_hash
				  AND v.is_current IS TRUE
				ORDER BY v.created_at DESC, v.id DESC LIMIT 1
			) current_version ON true
			WHERE ld.id = $1::uuid
			  AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $2::integer)
			  ${caseScope}
			LIMIT 1`, params)
		.catch(() => null);
	const row = res?.rows?.[0] as {
		uploaded_by: number | string | null;
		source_hash: string | null;
		revision_id: string | null;
	} | undefined;
	if (!row) return { allowed: false, reason: 'DOCUMENT_NOT_FOUND' };
	if (row.uploaded_by === null || row.uploaded_by === undefined) {
		return { allowed: true, documentId: input.documentId, scope: 'shared', actorId, sourceHash: row.source_hash ?? null, revisionId: row.revision_id ?? null };
	}
	if (Number(row.uploaded_by) === actorId) {
		return { allowed: true, documentId: input.documentId, scope: 'owner', actorId, sourceHash: row.source_hash ?? null, revisionId: row.revision_id ?? null };
	}
	return { allowed: false, reason: 'DOCUMENT_NOT_OWNED' };
}

/** SQL predicate for search/list queries: shared corpus or the actor's own uploads. */
export function libraryVisibilityPredicateV1(actorParamIndex: number, alias = 'ld'): string {
	return `(${alias}.uploaded_by IS NULL OR ${alias}.uploaded_by = $${actorParamIndex}::integer)`;
}

/** Subset of `documentIds` the actor may see (used to post-filter results from external executors). */
export async function filterVisibleLibraryDocumentIdsV1(
	documentIds: string[],
	actorId: unknown,
): Promise<Set<string>> {
	const actor = normalizeLibraryActorIdV1(actorId);
	const ids = [...new Set(documentIds.filter((id) => UUID_RE.test(id)))];
	if (actor === null || ids.length === 0) return new Set();
	const res = await pool.query(
		`SELECT id FROM library_documents ld
		 WHERE ld.id = ANY($1::uuid[]) AND ${libraryVisibilityPredicateV1(2)}`,
		[ids, actor],
	);
	return new Set(res.rows.map((r: { id: string }) => r.id));
}
