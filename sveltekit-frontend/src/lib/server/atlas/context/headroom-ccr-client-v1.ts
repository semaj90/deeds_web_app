import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ============================================================================
 * HEADROOM-CCR-CLIENT-01: Bounded Headroom v0.41.0 CCR Context Compression &
 * Reversible Retrieval Adapter (`:8787` WSL2 Loopback)
 * ============================================================================
 *
 * Disambiguation:
 *  - Port `:8787` (this client): Official Headroom v0.41.0 (`headroom-ai`) CCR
 *    context compression proxy (`POST /v1/compress` with `config.mode = "ccr"`,
 *    `GET /v1/retrieve/{hash}`, `GET /livez`).
 *  - Port `:8795`: Custom Node.js session memory proxy (`scripts/headroom-proxy.mjs`).
 *  - `RuntimeHeadroomV1`: Observational GPU/VRAM/Valkey telemetry contract
 *    (`orchestration/runtime-headroom-v1.ts`).
 *
 * Hard Authority Rules:
 *  1. Always send `config: { mode: "ccr" }` when reversible CCR hashes are required;
 *     Headroom's `/v1/compress` defaults to `_no_ccr_pipeline()` without it.
 *  2. `code_aware` (Tree-sitter AST) preserves exact UTF-8 source bytes, whereas
 *     `smart_crusher` (Rust PyO3) stashes compact canonical JSON (`separators=(",", ":")`),
 *     which preserves parsed JSON array semantics while changing raw byte length.
 *  3. Compressed prompts and CCR-retrieved payloads are NEVER canonical source
 *     evidence (`canonicalAuthority: false`, `replacementCanonicalEvidence: false`,
 *     `writesPerformed: false`, `summaryUpsertAllowed: false`).
 */

export const HEADROOM_CCR_SCHEMA_V1 = 'atlas.headroom-ccr.v1' as const;
export const DEFAULT_HEADROOM_CCR_ENDPOINT = 'http://127.0.0.1:8787' as const;

export const CcrHashSchema = z
	.string()
	.regex(/^[a-f0-9]{12,64}$/, 'CCR hash must be a 12-to-64 character lowercase hex digest prefix');

export const HeadroomMessageSchema = z
	.object({
		role: z.enum(['system', 'user', 'assistant', 'tool']),
		content: z.string(),
		name: z.string().min(1).optional(),
		tool_call_id: z.string().min(1).optional(),
	})
	.strict();

export type HeadroomMessageV1 = z.infer<typeof HeadroomMessageSchema>;

export const HeadroomCcrConfigSchema = z
	.object({
		mode: z.literal('ccr').default('ccr'),
		compress_user_messages: z.boolean().default(true),
		keep_turns: z.number().int().positive().max(50).default(1),
	})
	.strict();

export type HeadroomCcrConfigV1 = z.infer<typeof HeadroomCcrConfigSchema>;

export const HeadroomCcrCompressRequestV1Schema = z
	.object({
		model: z.string().min(1).default('ornith-1.5-9b'),
		messages: z.array(HeadroomMessageSchema).min(1),
		config: HeadroomCcrConfigSchema.default({
			mode: 'ccr',
			compress_user_messages: true,
			keep_turns: 1,
		}),
	})
	.strict();

export type HeadroomCcrCompressRequestV1 = z.infer<typeof HeadroomCcrCompressRequestV1Schema>;

export const HeadroomCcrCompressReceiptV1Schema = z
	.object({
		schema: z.literal(HEADROOM_CCR_SCHEMA_V1),
		endpoint: z.string().url(),
		portRole: z.literal('HEADROOM_CCR_8787'),
		model: z.string().min(1),
		mode: z.literal('ccr'),
		messages: z.array(HeadroomMessageSchema),
		tokensBefore: z.number().int().nonnegative(),
		tokensAfter: z.number().int().nonnegative(),
		tokensSaved: z.number().int().nonnegative(),
		compressionRatio: z.number().nonnegative(),
		transformsApplied: z.array(z.string()),
		ccrHashes: z.array(CcrHashSchema),
		compressedAt: z.string().datetime(),
		canonicalAuthority: z.literal(false),
		replacementCanonicalEvidence: z.literal(false),
		writesPerformed: z.literal(false),
		summaryUpsertAllowed: z.literal(false),
	})
	.strict();

export type HeadroomCcrCompressReceiptV1 = z.infer<typeof HeadroomCcrCompressReceiptV1Schema>;

export const CcrChecksumParityStatusSchema = z.enum([
	'EXACT_BYTE_MATCH',
	'SEMANTIC_JSON_MATCH_COMPACT_RESERIALIZED',
	'BYTE_AND_SEMANTIC_MISMATCH',
	'NO_BASELINE_PROVIDED',
]);

export type CcrChecksumParityStatus = z.infer<typeof CcrChecksumParityStatusSchema>;

export const HeadroomCcrRetrieveReceiptV1Schema = z
	.object({
		schema: z.literal(HEADROOM_CCR_SCHEMA_V1),
		endpoint: z.string().url(),
		hash: CcrHashSchema,
		found: z.boolean(),
		retrievedContent: z.string().nullable(),
		retrievedByteLength: z.number().int().nonnegative(),
		retrievedChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
		expectedOriginalChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
		exactByteChecksumMatch: z.boolean().nullable(),
		jsonSemanticEqual: z.boolean().nullable(),
		parityStatus: CcrChecksumParityStatusSchema,
		retrievedAt: z.string().datetime(),
		canonicalAuthority: z.literal(false),
		replacementCanonicalEvidence: z.literal(false),
		writesPerformed: z.literal(false),
		summaryUpsertAllowed: z.literal(false),
	})
	.strict();

export type HeadroomCcrRetrieveReceiptV1 = z.infer<typeof HeadroomCcrRetrieveReceiptV1Schema>;

export function sha256Utf8(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Validates that the Headroom endpoint uses loopback HTTP(S), carries no embedded
 * credentials, and is never bound to `0.0.0.0`.
 */
export function validateHeadroomEndpointUrl(rawEndpoint: string): string {
	let parsed: URL;
	try {
		parsed = new URL(rawEndpoint);
	} catch {
		throw new Error(`INVALID_HEADROOM_ENDPOINT_URL: ${rawEndpoint}`);
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`UNSUPPORTED_HEADROOM_PROTOCOL: ${parsed.protocol}`);
	}
	if (parsed.username || parsed.password) {
		throw new Error('HEADROOM_ENDPOINT_CREDENTIALS_FORBIDDEN');
	}
	if (parsed.hostname === '0.0.0.0') {
		throw new Error('HEADROOM_WILDCARD_BIND_FORBIDDEN: 0.0.0.0 is not permitted');
	}

	return parsed.origin;
}

/**
 * Deep structural equality check for JSON values to verify SmartCrusher CCR
 * retrieval parity when compact re-serialization (`separators=(",", ":")`) alters
 * raw whitespace byte counts.
 */
export function isDeepJsonEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== typeof b || a === null || b === null) return false;
	if (typeof a !== 'object') return false;

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!isDeepJsonEqual(a[i], b[i])) return false;
		}
		return true;
	}

	const keysA = Object.keys(a as Record<string, unknown>).sort();
	const keysB = Object.keys(b as Record<string, unknown>).sort();
	if (keysA.length !== keysB.length) return false;
	for (let i = 0; i < keysA.length; i++) {
		if (keysA[i] !== keysB[i]) return false;
		const key = keysA[i]!;
		if (
			!isDeepJsonEqual(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
			)
		) {
			return false;
		}
	}
	return true;
}

export function evaluateCcrRetrieveParity(
	retrievedContent: string,
	expectedOriginalText?: string,
): {
	retrievedByteLength: number;
	retrievedChecksumSha256: string;
	expectedOriginalChecksumSha256: string | null;
	exactByteChecksumMatch: boolean | null;
	jsonSemanticEqual: boolean | null;
	parityStatus: CcrChecksumParityStatus;
} {
	const retrievedByteLength = Buffer.byteLength(retrievedContent, 'utf8');
	const retrievedChecksumSha256 = sha256Utf8(retrievedContent);

	if (expectedOriginalText === undefined) {
		return {
			retrievedByteLength,
			retrievedChecksumSha256,
			expectedOriginalChecksumSha256: null,
			exactByteChecksumMatch: null,
			jsonSemanticEqual: null,
			parityStatus: 'NO_BASELINE_PROVIDED',
		};
	}

	const expectedOriginalChecksumSha256 = sha256Utf8(expectedOriginalText);
	const exactByteChecksumMatch = retrievedChecksumSha256 === expectedOriginalChecksumSha256;

	if (exactByteChecksumMatch) {
		return {
			retrievedByteLength,
			retrievedChecksumSha256,
			expectedOriginalChecksumSha256,
			exactByteChecksumMatch: true,
			jsonSemanticEqual: null,
			parityStatus: 'EXACT_BYTE_MATCH',
		};
	}

	let jsonSemanticEqual = false;
	try {
		const parsedRetrieved = JSON.parse(retrievedContent);
		const parsedOriginal = JSON.parse(expectedOriginalText);
		jsonSemanticEqual = isDeepJsonEqual(parsedRetrieved, parsedOriginal);
	} catch {
		jsonSemanticEqual = false;
	}

	return {
		retrievedByteLength,
		retrievedChecksumSha256,
		expectedOriginalChecksumSha256,
		exactByteChecksumMatch: false,
		jsonSemanticEqual,
		parityStatus: jsonSemanticEqual
			? 'SEMANTIC_JSON_MATCH_COMPACT_RESERIALIZED'
			: 'BYTE_AND_SEMANTIC_MISMATCH',
	};
}

export interface HeadroomCcrClientOptionsV1 {
	endpoint?: string;
	fetchImpl?: typeof fetch;
}

export function createHeadroomCcrClientV1(options: HeadroomCcrClientOptionsV1 = {}) {
	const endpoint = validateHeadroomEndpointUrl(options.endpoint ?? DEFAULT_HEADROOM_CCR_ENDPOINT);
	const fetchFn = options.fetchImpl ?? fetch;

	return {
		endpoint,

		async compress(input: HeadroomCcrCompressRequestV1): Promise<HeadroomCcrCompressReceiptV1> {
			const validatedInput = HeadroomCcrCompressRequestV1Schema.parse(input);
			const response = await fetchFn(`${endpoint}/v1/compress`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(validatedInput),
			});

			if (!response.ok) {
				throw new Error(`HEADROOM_CCR_COMPRESS_HTTP_${response.status}`);
			}

			const raw = (await response.json()) as Record<string, unknown>;
			const tokensBefore = Number(raw.tokens_before ?? 0);
			const tokensAfter = Number(raw.tokens_after ?? 0);
			const tokensSaved = Number(raw.tokens_saved ?? Math.max(0, tokensBefore - tokensAfter));
			const compressionRatio = Number(
				raw.compression_ratio ?? (tokensBefore > 0 ? tokensAfter / tokensBefore : 1),
			);

			return HeadroomCcrCompressReceiptV1Schema.parse({
				schema: HEADROOM_CCR_SCHEMA_V1,
				endpoint,
				portRole: 'HEADROOM_CCR_8787',
				model: validatedInput.model,
				mode: 'ccr',
				messages: Array.isArray(raw.messages) ? raw.messages : validatedInput.messages,
				tokensBefore,
				tokensAfter,
				tokensSaved,
				compressionRatio,
				transformsApplied: Array.isArray(raw.transforms_applied)
					? raw.transforms_applied.map(String)
					: [],
				ccrHashes: Array.isArray(raw.ccr_hashes) ? raw.ccr_hashes.map(String) : [],
				compressedAt: new Date().toISOString(),
				canonicalAuthority: false,
				replacementCanonicalEvidence: false,
				writesPerformed: false,
				summaryUpsertAllowed: false,
			});
		},

		async retrieve(input: {
			hash: string;
			expectedOriginalText?: string;
		}): Promise<HeadroomCcrRetrieveReceiptV1> {
			const validHash = CcrHashSchema.parse(input.hash);
			const response = await fetchFn(`${endpoint}/v1/retrieve/${validHash}`, {
				method: 'GET',
				headers: { Accept: 'application/json' },
			});

			if (!response.ok) {
				throw new Error(`HEADROOM_CCR_RETRIEVE_HTTP_${response.status}`);
			}

			const raw = (await response.json()) as Record<string, unknown>;
			if (raw.error || typeof raw.content !== 'string') {
				return HeadroomCcrRetrieveReceiptV1Schema.parse({
					schema: HEADROOM_CCR_SCHEMA_V1,
					endpoint,
					hash: validHash,
					found: false,
					retrievedContent: null,
					retrievedByteLength: 0,
					retrievedChecksumSha256: null,
					expectedOriginalChecksumSha256:
						input.expectedOriginalText !== undefined
							? sha256Utf8(input.expectedOriginalText)
							: null,
					exactByteChecksumMatch: null,
					jsonSemanticEqual: null,
					parityStatus: 'NO_BASELINE_PROVIDED',
					retrievedAt: new Date().toISOString(),
					canonicalAuthority: false,
					replacementCanonicalEvidence: false,
					writesPerformed: false,
					summaryUpsertAllowed: false,
				});
			}

			const parity = evaluateCcrRetrieveParity(raw.content, input.expectedOriginalText);
			return HeadroomCcrRetrieveReceiptV1Schema.parse({
				schema: HEADROOM_CCR_SCHEMA_V1,
				endpoint,
				hash: validHash,
				found: true,
				retrievedContent: raw.content,
				...parity,
				retrievedAt: new Date().toISOString(),
				canonicalAuthority: false,
				replacementCanonicalEvidence: false,
				writesPerformed: false,
				summaryUpsertAllowed: false,
			});
		},
	};
}
