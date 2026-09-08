import { createHash } from 'node:crypto';
import { z } from 'zod';

import { stableStringify } from './stable-hash.js';

export const LEXICAL_FEATURE_REGISTRY_V1_SCHEMA =
	'parent-atlas.lexical-feature-registry.v1' as const;
export const LEXICAL_FEATURE_EXTRACTOR_REVISION =
	'lexical-registry-extractor-v1' as const;

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/);

export const LexicalFeatureRegistryInputV1Schema = z
	.object({
		packetKey: z.string().min(1).optional(),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		workspaceRevision: z.string().min(1),
		content: z.string(),
		language: z.string().min(1).optional(),
	})
	.strict();

export type LexicalFeatureRegistryInputV1 = z.infer<typeof LexicalFeatureRegistryInputV1Schema>;

export const LexicalTokenStatsV1Schema = z
	.object({
		tokenCount: z.number().int().nonnegative(),
		uniqueTokenCount: z.number().int().nonnegative(),
		identifierCount: z.number().int().nonnegative(),
		uniqueIdentifierCount: z.number().int().nonnegative(),
		literalCount: z.number().int().nonnegative(),
		uniqueLiteralCount: z.number().int().nonnegative(),
	})
	.strict();

export type LexicalTokenStatsV1 = z.infer<typeof LexicalTokenStatsV1Schema>;

export const LexicalFeatureRegistryV1Schema = z
	.object({
		schema: z.literal(LEXICAL_FEATURE_REGISTRY_V1_SCHEMA),
		packetKey: z.string().min(1).nullable(),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		workspaceRevision: z.string().min(1),
		language: z.string().min(1).nullable(),
		extractorRevision: z.literal(LEXICAL_FEATURE_EXTRACTOR_REVISION),
		inputChecksum: SHA256,
		identifiers: z.array(z.string().min(1)),
		literals: z.array(z.string()),
		normalizedTerms: z.array(z.string().min(1)),
		symbolTerms: z.array(z.string().min(1)),
		tokenStats: LexicalTokenStatsV1Schema,
		canonicalAuthority: z.literal(false),
		writesPerformed: z.literal(false),
		checksum: SHA256,
	})
	.strict();

export type LexicalFeatureRegistryV1 = z.infer<typeof LexicalFeatureRegistryV1Schema>;

function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values)].sort(compareStrings);
}

function isIdentifierStart(char: string | undefined): boolean {
	return char !== undefined && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
	return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

function isWhitespace(char: string | undefined): boolean {
	return char !== undefined && /\s/.test(char);
}

function unescapeLiteral(raw: string): string {
	return raw.replace(/\\([\\'"`nrt])/g, (_match, escaped: string) => {
		switch (escaped) {
			case 'n':
				return '\n';
			case 'r':
				return '\r';
			case 't':
				return '\t';
			default:
				return escaped;
		}
	});
}

interface LexicalScanV1 {
	identifiers: string[];
	literals: string[];
}

/**
 * Small deterministic lexical scanner. It intentionally does not claim AST,
 * NLP, ontology, or domain meaning: comments are ignored, quoted literals are
 * captured, and identifiers are collected from the remaining source text.
 */
function scanSource(input: string): LexicalScanV1 {
	const identifiers: string[] = [];
	const literals: string[] = [];
	let index = 0;

	while (index < input.length) {
		const char = input[index];
		const next = input[index + 1];

		if (char === '/' && next === '/') {
			index += 2;
			while (index < input.length && input[index] !== '\n' && input[index] !== '\r') index += 1;
			continue;
		}

		if (char === '/' && next === '*') {
			index += 2;
			while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) index += 1;
			index = Math.min(input.length, index + 2);
			continue;
		}

		if (char === "'" || char === '"' || char === '`') {
			const quote = char;
			index += 1;
			let raw = '';
			let closed = false;
			while (index < input.length) {
				const literalChar = input[index];
				if (literalChar === '\\' && index + 1 < input.length) {
					raw += literalChar + input[index + 1];
					index += 2;
					continue;
				}
				if (literalChar === quote) {
					index += 1;
					closed = true;
					break;
				}
				raw += literalChar;
				index += 1;
			}
			if (closed) literals.push(unescapeLiteral(raw));
			continue;
		}

		if (isIdentifierStart(char)) {
			const start = index;
			index += 1;
			while (isIdentifierPart(input[index])) index += 1;
			identifiers.push(input.slice(start, index));
			continue;
		}

		index += 1;
	}

	return { identifiers, literals };
}

function splitTerm(value: string): string[] {
	return value
		.normalize('NFKC')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/[\s_$./\\:()[\]{}<>-]+/g, ' ')
		.toLowerCase()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ''))
		.filter((term) => term.length > 0);
}

export function runLexicalFeatureRegistryV1(
	input: LexicalFeatureRegistryInputV1,
): LexicalFeatureRegistryV1 {
	const parsedInput = LexicalFeatureRegistryInputV1Schema.parse(input);
	const scan = scanSource(parsedInput.content);
	const identifiers = sortedUnique(scan.identifiers);
	const literals = sortedUnique(scan.literals);
	const identifierTerms = scan.identifiers.flatMap(splitTerm);
	const literalTerms = scan.literals.flatMap(splitTerm);
	const normalizedTerms = sortedUnique([...identifierTerms, ...literalTerms]);
	const symbolTerms = sortedUnique(identifierTerms);
	const body = {
		schema: LEXICAL_FEATURE_REGISTRY_V1_SCHEMA,
		packetKey: parsedInput.packetKey ?? null,
		sourceRef: parsedInput.sourceRef,
		sourceRevision: parsedInput.sourceRevision,
		workspaceRevision: parsedInput.workspaceRevision,
		language: parsedInput.language ?? null,
		extractorRevision: LEXICAL_FEATURE_EXTRACTOR_REVISION,
		inputChecksum: sha256Hex(parsedInput.content),
		identifiers,
		literals,
		normalizedTerms,
		symbolTerms,
		tokenStats: {
			tokenCount: identifierTerms.length + literalTerms.length,
			uniqueTokenCount: normalizedTerms.length,
			identifierCount: scan.identifiers.length,
			uniqueIdentifierCount: identifiers.length,
			literalCount: scan.literals.length,
			uniqueLiteralCount: literals.length,
		},
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};

	return LexicalFeatureRegistryV1Schema.parse({
		...body,
		checksum: sha256Hex(stableStringify(body)),
	});
}
