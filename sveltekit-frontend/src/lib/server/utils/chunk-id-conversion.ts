/**
 * Chunk Identifier Resolution with Discriminated Union Routing
 *
 * Resolves chunk identifiers by their actual kind, querying the correct column.
 * CRITICAL: Do NOT invent synthetic UUIDs. Query the column where the value belongs.
 *
 * **Identity Lanes**:
 * - PRIMARY_UUID: canonical row id (uuid column) — query as UUID
 * - CHUNK_ID: stable source/indexer identity (text column) — query as text
 * - LEGACY_INT: pre-uuid integer alias (stored in chunk_id text) — parse as string, query chunk_id
 *
 * DO NOT overload identifiers. DO NOT generate synthetic UUIDs for queries.
 * Only use UUIDs if the database ingestion contract explicitly created rows via UUIDv5(namespace, legacyId).
 */

import { z } from 'zod';
import { sql } from 'drizzle-orm';

/**
 * Discriminated union: classify the incoming reference by its actual kind
 */
export type ChunkReference =
	| { kind: 'primary_uuid'; value: string }
	| { kind: 'chunk_id'; value: string }
	| { kind: 'legacy_int'; value: string };

/**
 * Classify a raw identifier into its resolution kind
 * @param value - The raw identifier from request/payload
 * @returns Discriminated ChunkReference or null if unclassifiable
 */
export function classifyChunkReference(value: unknown): ChunkReference | null {
	if (typeof value !== 'string') {
		return null;
	}

	// UUID format: 8-4-4-4-12 hex chars with hyphens
	if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
		return { kind: 'primary_uuid', value };
	}

	// Pure integer (decimal string, no leading zeros except "0")
	if (/^[0-9]+$/.test(value) && !/^0[0-9]/.test(value)) {
		return { kind: 'legacy_int', value };
	}

	// Anything else is treated as chunk_id (text)
	return { kind: 'chunk_id', value };
}

/**
 * Resolve chunk references to database records via the correct identity column
 *
 * @param db - Drizzle database instance
 * @param rawIds - Raw identifiers from request/payload
 * @returns Array of matching chunk records with their resolution kind tracked
 * @throws If no records found for any reference (can be caught and handled)
 *
 * @example
 * const refs = [
 *   { kind: 'primary_uuid', value: '668f...' },
 *   { kind: 'legacy_int', value: '3711862720' },
 *   { kind: 'chunk_id', value: 'file.ts::functionName' }
 * ];
 * const chunks = await resolveChunkReferences(db, refs);
 */
export async function resolveChunkReferences(
	db: any,
	rawIds: unknown[]
): Promise<Array<any & { _resolvedVia: string }>> {
	if (!Array.isArray(rawIds) || rawIds.length === 0) {
		return [];
	}

	// Classify all references
	const classified = rawIds
		.map((id) => classifyChunkReference(id))
		.filter((ref): ref is ChunkReference => ref !== null);

	if (classified.length === 0) {
		return [];
	}

	// Group by kind
	const byKind = {
		primary_uuid: classified.filter((r) => r.kind === 'primary_uuid').map((r) => r.value),
		chunk_id: classified
			.filter((r) => r.kind === 'chunk_id' || r.kind === 'legacy_int')
			.map((r) => r.value),
	};

	const results: Array<any & { _resolvedVia: string }> = [];

	// Query primary UUIDs
	if (byKind.primary_uuid.length > 0) {
		const uuidResults = await db.execute(sql`
			SELECT
				id,
				chunk_id,
				relative_path,
				line_start,
				line_end,
				content
			FROM codebase_chunk_index
			WHERE id = ANY(${byKind.primary_uuid}::uuid[])
		`);
		(uuidResults.rows || []).forEach((row: any) => {
			results.push({ ...row, _resolvedVia: 'primary_uuid' });
		});
	}

	// Query chunk_id column (handles both text and legacy integer stored as text)
	if (byKind.chunk_id.length > 0) {
		const textResults = await db.execute(sql`
			SELECT
				id,
				chunk_id,
				relative_path,
				line_start,
				line_end,
				content
			FROM codebase_chunk_index
			WHERE chunk_id = ANY(${byKind.chunk_id}::text[])
		`);
		(textResults.rows || []).forEach((row: any) => {
			results.push({ ...row, _resolvedVia: 'chunk_id' });
		});
	}

	return results;
}

/**
 * Resolve chunk identifiers (backward compatible wrapper for batch resolution)
 *
 * Issues separate queries for UUID vs text identifiers to avoid empty-array typing issues.
 * For new code, use resolveChunkReferences() with explicit discriminated union typing.
 *
 * @param db - Drizzle database instance
 * @param rawIds - Raw identifiers from request/payload
 * @returns Array of matching chunk records
 *
 * @deprecated Use resolveChunkReferences() for explicit kind tracking
 */
export async function resolveChunksByIdentifiers(db: any, rawIds: unknown) {
	if (!Array.isArray(rawIds)) {
		return [];
	}

	const refs = rawIds
		.map((id) => classifyChunkReference(id))
		.filter((ref): ref is ChunkReference => ref !== null);

	const results = await resolveChunkReferences(db, refs.map((r) => r.value));
	// Strip the _resolvedVia marker for backward compatibility
	return results.map(({ _resolvedVia, ...rest }) => rest);
}

/**
 * Test helper: did this resolve correctly?
 *
 * @param result - A resolved chunk with _resolvedVia marker
 * @param expectedKind - The kind we expected it to resolve via
 * @returns true if the resolution matched the expectation
 */
export function verifyResolutionKind(
	result: any & { _resolvedVia?: string },
	expectedKind: 'primary_uuid' | 'chunk_id' | 'legacy_int'
): boolean {
	// legacy_int resolves via chunk_id query
	const expectedQuery = expectedKind === 'legacy_int' ? 'chunk_id' : expectedKind;
	return result._resolvedVia === expectedQuery;
}

/**
 * NOT RECOMMENDED: Legacy UUID generation for rows already created via this pattern
 *
 * Use this ONLY if:
 * 1. The database rows were created with: id = UUIDv5(namespace, legacyChunkId)
 * 2. You are accessing those existing rows and need the same UUID again
 * 3. You have tests proving this matches actual row IDs
 *
 * DO NOT use this to invent identities for query routing.
 * Query by the column where the value belongs instead.
 *
 * @deprecated Consider querying chunk_id directly instead of inventing a UUID
 */
export const legacyChunkIdToUuid: ((value: string) => string) | null = null;
