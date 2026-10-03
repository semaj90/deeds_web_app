import { z } from 'zod';
import { sha256Stable } from './contracts.js';

// AFC-KW-02: versioned vocabulary + normalization contract — case folding, Unicode
// normalization, camelCase/snake_case/kebab-case splitting, dot/path segmentation, and
// package-name preservation. This is a SEPARATE revision domain from
// KEYWORD_NORMALIZATION_REVISION_V1 (keyword-recognition-v1.ts's plain
// NFC+trim+lowercase exact-token normalization, used by the already-shipped
// AFC-KW-03/QUERY-RADIX-01 radix compiler) — the two must never be conflated, since a
// change to this splitting policy must not silently invalidate the exact-token radix
// index's revision.

export const TOKEN_NORMALIZATION_REVISION_V1 = 'token-normalization:split-case-path-v1' as const;
export const TOKEN_NORMALIZATION_SCHEMA_V1 = 'atlas.token-normalization.v1' as const;

// Scoped npm-style package names (@scope/name) are preserved whole — splitting them on
// `/` or `-` would destroy the package identity a helper/registry entry depends on.
const SCOPED_PACKAGE_PATTERN = /^@[\p{L}\p{N}_.-]+\/[\p{L}\p{N}_.-]+$/u;

function isScopedPackageName(value: string): boolean {
	return SCOPED_PACKAGE_PATTERN.test(value);
}

/** Split a camelCase/PascalCase run into lowercase word tokens: "fooBarBAZ" -> ["foo","bar","baz"]. */
function splitCaseRun(value: string): string[] {
	const withBoundaries = value
		.replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1\u0000$2')
		.replace(/([\p{Lu}]+)([\p{Lu}][\p{Ll}])/gu, '$1\u0000$2');
	return withBoundaries.split('\u0000').filter((part) => part.length > 0).map((part) => part.toLowerCase());
}

/**
 * Normalize and split one raw term into an ordered list of lowercase constituent
 * tokens. Deterministic and pure — never touches a live vocabulary or registry.
 *
 * - NFC-normalizes and lowercases every output token.
 * - A scoped package name (`@scope/name`) is preserved as a single token, unsplit.
 * - Everything else is segmented on `.`, `/`, `-`, `_`, and whitespace, then each
 *   resulting segment is further split on camelCase/PascalCase boundaries.
 */
export function normalizeAndSplitTokenV1(raw: string): string[] {
	const normalized = raw.normalize('NFC').trim();
	if (normalized.length === 0) return [];
	if (isScopedPackageName(normalized)) return [normalized.toLowerCase()];
	const segments = normalized.split(/[.\/_\-\s]+/u).filter((segment) => segment.length > 0);
	return segments.flatMap(splitCaseRun);
}

export const TokenNormalizationPolicyV1Schema = z.object({
	schema: z.literal(TOKEN_NORMALIZATION_SCHEMA_V1),
	revision: z.literal(TOKEN_NORMALIZATION_REVISION_V1),
	preservesScopedPackageNames: z.literal(true),
	segmentBoundaries: z.array(z.string().min(1)),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TokenNormalizationPolicyV1 = z.infer<typeof TokenNormalizationPolicyV1Schema>;

const SEGMENT_BOUNDARIES = ['.', '/', '-', '_', 'whitespace', 'camelCaseBoundary'] as const;

export function buildTokenNormalizationPolicyV1(): TokenNormalizationPolicyV1 {
	const body = {
		schema: TOKEN_NORMALIZATION_SCHEMA_V1,
		revision: TOKEN_NORMALIZATION_REVISION_V1,
		preservesScopedPackageNames: true as const,
		segmentBoundaries: [...SEGMENT_BOUNDARIES],
	};
	return TokenNormalizationPolicyV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export const TokenNormalizationResultV1Schema = z.object({
	schema: z.literal(TOKEN_NORMALIZATION_SCHEMA_V1),
	policyRevision: z.literal(TOKEN_NORMALIZATION_REVISION_V1),
	rawTerm: z.string().min(1),
	tokens: z.array(z.string().min(1)),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TokenNormalizationResultV1 = z.infer<typeof TokenNormalizationResultV1Schema>;

export function buildTokenNormalizationResultV1(rawTerm: string): TokenNormalizationResultV1 {
	const body = {
		schema: TOKEN_NORMALIZATION_SCHEMA_V1,
		policyRevision: TOKEN_NORMALIZATION_REVISION_V1,
		rawTerm,
		tokens: normalizeAndSplitTokenV1(rawTerm),
	};
	return TokenNormalizationResultV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
