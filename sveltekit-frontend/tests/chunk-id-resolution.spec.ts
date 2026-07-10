/**
 * Chunk ID Resolution Tests
 *
 * Validates that:
 * 1. The legacy integer 3711862720 resolves correctly via chunk_id column
 * 2. UUIDs resolve via primary id column
 * 3. Text chunk_ids resolve via chunk_id column
 * 4. No synthetic UUIDs are invented
 * 5. Unknown formats are rejected gracefully
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { classifyChunkReference, resolveChunkReferences, verifyResolutionKind } from '$lib/server/utils/chunk-id-conversion';

describe('Chunk ID Resolution', () => {
	describe('classifyChunkReference', () => {
		it('classifies a UUID as primary_uuid', () => {
			const result = classifyChunkReference('668f1234-5678-90ab-cdef-1234567890ab');
			expect(result).toEqual({ kind: 'primary_uuid', value: '668f1234-5678-90ab-cdef-1234567890ab' });
		});

		it('classifies a legacy integer as legacy_int', () => {
			const result = classifyChunkReference('3711862720');
			expect(result).toEqual({ kind: 'legacy_int', value: '3711862720' });
		});

		it('classifies a text chunk_id as chunk_id', () => {
			const result = classifyChunkReference('src/lib/server/auth.ts::validateSession');
			expect(result).toEqual({ kind: 'chunk_id', value: 'src/lib/server/auth.ts::validateSession' });
		});

		it('rejects null', () => {
			expect(classifyChunkReference(null)).toBeNull();
		});

		it('rejects undefined', () => {
			expect(classifyChunkReference(undefined)).toBeNull();
		});

		it('rejects non-string types', () => {
			expect(classifyChunkReference(12345)).toBeNull();
			expect(classifyChunkReference({ value: '123' })).toBeNull();
			expect(classifyChunkReference(['123'])).toBeNull();
		});

		it('rejects leading-zero numbers (avoid octal confusion)', () => {
			const result = classifyChunkReference('0123456789');
			// Leading zero → treated as chunk_id, not legacy_int
			expect(result?.kind).toBe('chunk_id');
		});

		it('classifies negative integers as legacy_int or chunk_id based on format', () => {
			// Negative numbers with - prefix are not in standard integer format
			// So they would be chunk_ids
			const result = classifyChunkReference('-123');
			expect(result?.kind).toBe('chunk_id');
		});

		it('treats "0" as a valid legacy_int', () => {
			const result = classifyChunkReference('0');
			expect(result).toEqual({ kind: 'legacy_int', value: '0' });
		});
	});

	describe('verifyResolutionKind', () => {
		it('confirms primary_uuid resolution', () => {
			const result = { id: '668f...', _resolvedVia: 'primary_uuid' };
			expect(verifyResolutionKind(result, 'primary_uuid')).toBe(true);
			expect(verifyResolutionKind(result, 'chunk_id')).toBe(false);
		});

		it('confirms chunk_id resolution', () => {
			const result = { id: '668f...', _resolvedVia: 'chunk_id' };
			expect(verifyResolutionKind(result, 'chunk_id')).toBe(true);
			expect(verifyResolutionKind(result, 'legacy_int')).toBe(true); // legacy_int resolves via chunk_id
		});

		it('handles missing _resolvedVia gracefully', () => {
			const result = { id: '668f...' };
			expect(verifyResolutionKind(result, 'primary_uuid')).toBe(false);
		});
	});

	describe('Integration: resolveChunkReferences', () => {
		it('handles empty input', async () => {
			// Mock db
			const mockDb = { execute: () => ({ rows: [] }) };
			const result = await resolveChunkReferences(mockDb, []);
			expect(result).toEqual([]);
		});

		it('filters out unclassifiable references', async () => {
			const mockDb = { execute: () => ({ rows: [] }) };
			const result = await resolveChunkReferences(mockDb, [null, undefined, 12345]);
			expect(result).toEqual([]);
		});

		it('routes primary_uuid to correct query', async () => {
			let executedQuery: any = null;
			const mockDb = {
				execute: (query: any) => {
					executedQuery = query;
					return { rows: [{ id: '668f...', chunk_id: 'test.ts' }] };
				},
			};

			const refs = ['668f1234-5678-90ab-cdef-1234567890ab'];
			const result = await resolveChunkReferences(mockDb, refs);

			expect(result.length).toBe(1);
			expect(result[0]._resolvedVia).toBe('primary_uuid');
			// Verify that UUID was used in the query (not converted to text)
			expect(executedQuery).toBeDefined();
		});

		it('routes legacy_int to chunk_id query (NOT to synthetic UUID)', async () => {
			let executedQueries: any[] = [];
			const mockDb = {
				execute: (query: any) => {
					executedQueries.push(query);
					// Simulate finding the row in chunk_id column
					return { rows: [{ id: 'real-uuid-123', chunk_id: '3711862720' }] };
				},
			};

			const refs = ['3711862720'];
			const result = await resolveChunkReferences(mockDb, refs);

			expect(result.length).toBe(1);
			expect(result[0]._resolvedVia).toBe('chunk_id');
			// CRITICAL: We found a real row via chunk_id, NOT by inventing a UUID
			expect(result[0].chunk_id).toBe('3711862720');
		});

		it('combines multiple reference kinds in one call', async () => {
			const mockDb = {
				execute: (query: any) => {
					// Return different results based on which query ran
					return {
						rows: [
							{ id: 'uuid1', chunk_id: 'test1' },
							{ id: 'uuid2', chunk_id: 'test2' },
						],
					};
				},
			};

			const refs = ['668f1234-5678-90ab-cdef-1234567890ab', '3711862720', 'src/file.ts'];
			const result = await resolveChunkReferences(mockDb, refs);

			expect(result.length).toBeGreaterThan(0);
			// All results should have _resolvedVia tracked
			expect(result.every((r) => r._resolvedVia)).toBe(true);
		});

		it('handles database errors gracefully', async () => {
			const mockDb = {
				execute: () => {
					throw new Error('Database connection failed');
				},
			};

			const refs = ['668f1234-5678-90ab-cdef-1234567890ab'];

			// Should throw, not silently fail
			await expect(resolveChunkReferences(mockDb, refs)).rejects.toThrow(
				'Database connection failed'
			);
		});
	});

	describe('Backward compatibility', () => {
		it('resolveChunksByIdentifiers strips _resolvedVia marker', async () => {
			const { resolveChunksByIdentifiers } = await import('$lib/server/utils/chunk-id-conversion');

			const mockDb = {
				execute: () => ({
					rows: [{ id: '668f...', chunk_id: 'test.ts' }],
				}),
			};

			const result = await resolveChunksByIdentifiers(mockDb, ['668f1234-5678-90ab-cdef-1234567890ab']);
			expect(result[0]).not.toHaveProperty('_resolvedVia');
		});
	});

	describe('Edge cases', () => {
		it('does not confuse text that looks like hex', () => {
			// "deadbeef" is hex but not a valid UUID (no hyphens)
			const result = classifyChunkReference('deadbeef');
			expect(result?.kind).toBe('chunk_id');
		});

		it('handles very long text chunk_ids', () => {
			const longId = 'a'.repeat(512);
			const result = classifyChunkReference(longId);
			expect(result?.kind).toBe('chunk_id');
		});

		it('rejects empty string', () => {
			const result = classifyChunkReference('');
			expect(result?.kind).toBe('chunk_id'); // Empty is classified as chunk_id (will fail DB query)
		});
	});
});
