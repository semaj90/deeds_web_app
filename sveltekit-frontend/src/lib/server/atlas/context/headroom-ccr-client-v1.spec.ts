import { describe, expect, it, vi } from 'vitest';
import {
	createHeadroomCcrClientV1,
	evaluateCcrRetrieveParity,
	sha256Utf8,
	validateHeadroomEndpointUrl,
} from './headroom-ccr-client-v1.js';

describe('HEADROOM-CCR-CLIENT-01 (headroom-ccr-client-v1)', () => {
	it('enforces config.mode="ccr" on /v1/compress and emits non-canonical receipt with ccrHashes', async () => {
		const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			expect(String(url)).toBe('http://127.0.0.1:8787/v1/compress');
			const sentBody = JSON.parse(String(init?.body));
			expect(sentBody.config.mode).toBe('ccr');
			expect(sentBody.config.compress_user_messages).toBe(true);

			return new Response(
				JSON.stringify({
					messages: [
						{ role: 'system', content: 'Protected system instruction' },
						{
							role: 'user',
							content: '[CCR: b3df3352432ed4f38c765afe] compressed AST summary',
						},
					],
					tokens_before: 11736,
					tokens_after: 3136,
					tokens_saved: 8600,
					compression_ratio: 0.2672,
					transforms_applied: [
						'router:protected:system_message',
						'router:code_aware:0.53',
						'router:smart_crusher:0.03',
					],
					ccr_hashes: ['b3df3352432ed4f38c765afe', '839c4bd65713'],
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			);
		});

		const client = createHeadroomCcrClientV1({
			endpoint: 'http://127.0.0.1:8787',
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});

		const receipt = await client.compress({
			model: 'ornith-1.5-9b',
			messages: [
				{ role: 'system', content: 'Protected system instruction' },
				{ role: 'user', content: 'export function verifyCandidate() { return true; }' },
			],
		});

		expect(receipt.mode).toBe('ccr');
		expect(receipt.portRole).toBe('HEADROOM_CCR_8787');
		expect(receipt.tokensBefore).toBe(11736);
		expect(receipt.tokensAfter).toBe(3136);
		expect(receipt.tokensSaved).toBe(8600);
		expect(receipt.ccrHashes).toEqual(['b3df3352432ed4f38c765afe', '839c4bd65713']);
		expect(receipt.canonicalAuthority).toBe(false);
		expect(receipt.replacementCanonicalEvidence).toBe(false);
		expect(receipt.writesPerformed).toBe(false);
		expect(receipt.summaryUpsertAllowed).toBe(false);
	});

	it('verifies EXACT_BYTE_MATCH on code_aware Tree-sitter AST CCR retrieval', async () => {
		const originalCode = Array.from(
			{ length: 60 },
			(_, idx) =>
				`export function computeFeatureOrdinal_${idx}(candidate: number): number {\n  return candidate + ${idx};\n}\n`,
		).join('\n');

		const fakeFetch = vi.fn(async (url: string | URL | Request) => {
			expect(String(url)).toBe('http://127.0.0.1:8787/v1/retrieve/b3df3352432ed4f38c765afe');
			return new Response(
				JSON.stringify({
					hash: 'b3df3352432ed4f38c765afe',
					content: originalCode,
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } },
			);
		});

		const client = createHeadroomCcrClientV1({
			endpoint: 'http://127.0.0.1:8787',
			fetchImpl: fakeFetch as unknown as typeof fetch,
		});

		const retrieved = await client.retrieve({
			hash: 'b3df3352432ed4f38c765afe',
			expectedOriginalText: originalCode,
		});

		expect(retrieved.found).toBe(true);
		expect(retrieved.exactByteChecksumMatch).toBe(true);
		expect(retrieved.parityStatus).toBe('EXACT_BYTE_MATCH');
		expect(retrieved.retrievedChecksumSha256).toBe(sha256Utf8(originalCode));
		expect(retrieved.canonicalAuthority).toBe(false);
		expect(retrieved.replacementCanonicalEvidence).toBe(false);
	});

	it('detects SEMANTIC_JSON_MATCH_COMPACT_RESERIALIZED when SmartCrusher alters whitespace bytes', async () => {
		const originalFormattedJson = JSON.stringify(
			[
				{ id: 1, sourceRef: 'src/lib/server/atlas/a.ts', score: 0.91, extra: { tag: 'alpha' } },
				{ id: 2, sourceRef: 'src/lib/server/atlas/b.ts', score: 0.87, debug: [1, 2, 3] },
			],
			null,
			2,
		);
		const compactReserializedJson = JSON.stringify(JSON.parse(originalFormattedJson));
		expect(Buffer.byteLength(originalFormattedJson)).toBeGreaterThan(
			Buffer.byteLength(compactReserializedJson),
		);

		const parity = evaluateCcrRetrieveParity(compactReserializedJson, originalFormattedJson);
		expect(parity.exactByteChecksumMatch).toBe(false);
		expect(parity.jsonSemanticEqual).toBe(true);
		expect(parity.parityStatus).toBe('SEMANTIC_JSON_MATCH_COMPACT_RESERIALIZED');
	});

	it('rejects 0.0.0.0 wildcard binds, embedded credentials, and malformed CCR hashes', async () => {
		expect(() => validateHeadroomEndpointUrl('http://0.0.0.0:8787')).toThrow(
			/HEADROOM_WILDCARD_BIND_FORBIDDEN/,
		);
		expect(() => validateHeadroomEndpointUrl('http://user:pass@127.0.0.1:8787')).toThrow(
			/HEADROOM_ENDPOINT_CREDENTIALS_FORBIDDEN/,
		);
		expect(() => validateHeadroomEndpointUrl('ftp://127.0.0.1:8787')).toThrow(
			/UNSUPPORTED_HEADROOM_PROTOCOL/,
		);

		const client = createHeadroomCcrClientV1({
			endpoint: 'http://127.0.0.1:8787',
			fetchImpl: vi.fn() as unknown as typeof fetch,
		});

		await expect(client.retrieve({ hash: 'NOT-A-VALID-HEX-HASH!' })).rejects.toThrow();
	});
});
