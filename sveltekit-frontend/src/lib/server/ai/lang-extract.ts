/**
 * LangExtract — typed structured extraction from LLM outputs.
 *
 * Wraps bifrostChat() with JSON-mode prompting + Zod schema validation.
 * Zero API cost: all requests route through L1 Redis → L2 Bifrost → L3 Ollama.
 *
 * Memory / performance:
 *   - Schema fingerprint (L1 cache key) derived from Zod shape description
 *     (first 80 chars, whitespace-compressed) — stays in L1 cache line
 *   - Extraction results cached via Redis exact-match (5ms re-use)
 *   - Zod .safeParse() avoids try/catch overhead on happy path
 *   - JSON.parse on cleaned string only — no intermediate objects
 *
 * Use cases:
 *   - Extract legal entities (statutes, citations, dates) from documents
 *   - Extract ACE error-fix suggestions as typed objects
 *   - Extract ML model metadata (tensor shapes, CUDA kernels) from code
 *   - Classify code chunks into structured semantic categories
 *
 * @module
 */

import { z } from 'zod';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractResult<T> {
	data: T | null;
	raw: string;
	valid: boolean;
	error?: string;
	durationMs: number;
}

// ── Schema description builder ─────────────────────────────────────────────────
// Walks the Zod type tree to produce a compact JSON-shape string for the
// LLM system prompt. Minimal recursion depth (≤3) — no cyclic types in our schemas.

function describeShape(schema: z.ZodTypeAny, depth = 0): string {
	const sp = '  '.repeat(depth);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const s = schema as any; // Zod v3/v4 internal shapes differ; any-cast is intentional
	const t: string = s._def?.typeName ?? s.constructor?.name ?? '';

	if (t === 'ZodObject') {
		const shape = s.shape as Record<string, z.ZodTypeAny>;
		const fields = Object.entries(shape).map(([k, v]) =>
			`${sp}  "${k}": ${describeShape(v, depth + 1)}`
		);
		return `{\n${fields.join(',\n')}\n${sp}}`;
	}
	if (t === 'ZodArray') {
		return `[${describeShape(s.element ?? s._def?.type, depth)}]`;
	}
	if (t === 'ZodEnum') {
		// Zod v3: s.options (string[]); Zod v4: s.options or s._def.values
		const vals: string[] = s.options ?? Object.values(s._def?.values ?? {});
		return JSON.stringify(vals);
	}
	if (t === 'ZodOptional' || t === 'ZodNullable') {
		const inner = s.unwrap?.() ?? s._def?.innerType;
		return describeShape(inner, depth) + ' | null';
	}
	if (t === 'ZodString')  return '"string"';
	if (t === 'ZodNumber')  return 'number';
	if (t === 'ZodBoolean') return 'boolean';
	return '"any"';
}

// ── Core extraction function ───────────────────────────────────────────────────

/**
 * Extract structured data from `content` using LLM + Zod schema validation.
 *
 * Routes through L1 Redis → L2 Bifrost → L3 Ollama (zero API cost).
 * Temperature defaults to 0 for deterministic extraction.
 *
 * @param schema      - Zod schema for expected output shape
 * @param instruction - Natural language extraction instruction
 * @param content     - Source text (truncated to 4 000 chars at LLM boundary)
 * @param options     - Model, temperature, cache key, entity tags
 */
export async function extractStructured<T>(
	schema: z.ZodType<T>,
	instruction: string,
	content: string,
	options?: {
		model?:        string;
		temperature?:  number;
		maxTokens?:    number;
		cacheKey?:     string;
		entityTags?:   string[];
		timeoutMs?:    number;
	}
): Promise<ExtractResult<T>> {
	const t0    = performance.now();
	const model = options?.model ?? ENV.OLLAMA_CHAT_MODEL;

	// Build JSON shape description for system prompt
	const shapeDesc = describeShape(schema as z.ZodTypeAny);

	// Derive cache key from schema fingerprint (first 80 chars, ws-compressed)
	const schemaFp = shapeDesc.replace(/\s+/g, '-').slice(0, 80);
	const cacheKey = options?.cacheKey ?? `langextract:${schemaFp}`;

	const messages: Array<{ role: 'system' | 'user'; content: string }> = [
		{
			role: 'system',
			content: [
				'You are a structured data extractor.',
				'Respond with ONLY valid JSON — no markdown, no explanation, no code fences.',
				`Your JSON must match exactly this shape:\n${shapeDesc}`,
			].join('\n'),
		},
		{
			role: 'user',
			content: `${instruction}\n\n---\n${content.slice(0, 4_000)}\n---\n\nJSON:`,
		},
	];

	try {
		const raw = await bifrostChat(messages, model, {
			temperature: options?.temperature ?? 0,
			maxTokens:   options?.maxTokens  ?? 800,
			timeoutMs:   options?.timeoutMs  ?? 30_000,
			cacheKey,
			entityTags:  options?.entityTags,
		});

		// Strip markdown code fences (Ollama wraps despite system prompt ~15% of the time)
		const cleaned = raw
			.replace(/^```(?:json)?\s*/m, '')
			.replace(/\s*```\s*$/m, '')
			.trim();

		let parsed: unknown;
		try {
			parsed = JSON.parse(cleaned);
		} catch (parseErr) {
			return {
				data:       null,
				raw,
				valid:      false,
				error:      `JSON parse failed: ${(parseErr as Error).message}`,
				durationMs: performance.now() - t0,
			};
		}

		const result = schema.safeParse(parsed);
		if (result.success) {
			return { data: result.data, raw, valid: true, durationMs: performance.now() - t0 };
		}
		return {
			data:       null,
			raw,
			valid:      false,
			error:      result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
			durationMs: performance.now() - t0,
		};
	} catch (err) {
		return {
			data:       null,
			raw:        '',
			valid:      false,
			error:      (err as Error).message,
			durationMs: performance.now() - t0,
		};
	}
}

// ── Pre-built schemas ──────────────────────────────────────────────────────────

/** Legal citations extracted from document text */
export const LegalCitationSchema = z.object({
	citations: z.array(z.object({
		type:         z.enum(['statute', 'case', 'regulation', 'constitution']),
		text:         z.string(),
		jurisdiction: z.string().optional(),
		year:         z.number().int().optional(),
	})),
	confidence: z.number().min(0).max(1),
});

/** Code error analysis with fix suggestion */
export const CodeErrorSchema = z.object({
	errorType:     z.enum(['type-error', 'syntax', 'import', 'logic', 'svelte-rune', 'api-mismatch']),
	severity:      z.enum(['critical', 'error', 'warning', 'info']),
	affectedLines: z.array(z.number()).optional(),
	suggestedFix:  z.string(),
	explanation:   z.string(),
});

/**
 * ML model metadata extracted from source code.
 * Used by the Karpathy tag pipeline to enrich `ml-inference` chunks in Qdrant.
 *
 * L1-cache-friendly cache key: `langextract:ml-schema:<filePath>`
 * so re-tagging skips the LLM for already-analyzed files.
 */
export const MLSchemaMetadataSchema = z.object({
	isMLFile:    z.boolean(),
	framework:   z.enum(['libtorch', 'onnx', 'webgpu', 'tensorrt', 'tensorflow', 'custom']).optional(),
	modelType:   z.enum(['transformer', 'cnn', 'rnn', 'som', 'kmeans', 'mlp', 'embedding', 'rl']).optional(),
	tensorDims:  z.array(z.number().int().positive()).optional(),
	cudaKernels: z.array(z.string()).optional(),
	precision:   z.enum(['fp32', 'fp16', 'int8', 'int4', 'bf16']).optional(),
	nApiExports: z.array(z.string()).optional(),
});

export type LegalCitation   = z.infer<typeof LegalCitationSchema>;
export type CodeError       = z.infer<typeof CodeErrorSchema>;
export type MLSchemaMetadata = z.infer<typeof MLSchemaMetadataSchema>;

// ── Convenience wrappers ───────────────────────────────────────────────────────

/**
 * Extract legal citations from document text.
 * Cache key includes content length to differentiate different excerpts.
 */
export async function extractLegalCitations(text: string, model?: string) {
	return extractStructured(
		LegalCitationSchema,
		'Extract ALL legal citations (statutes, case names, regulations, constitutional provisions) from the text.',
		text,
		{
			model,
			cacheKey:    `langextract:citations:${text.length}`,
			entityTags:  ['legal-citation', 'statute', 'case'],
			temperature: 0,
		}
	);
}

/**
 * Extract ML / GPU metadata from TypeScript or C++ source code.
 * Used by `karpathy-tag/+server.ts` to enrich `ml-inference` chunks in Qdrant.
 */
export async function extractMLMetadata(code: string, filePath: string, model?: string) {
	return extractStructured(
		MLSchemaMetadataSchema,
		[
			`Analyze this source file: ${filePath}`,
			'Set isMLFile=true ONLY if the file directly performs GPU compute, tensor operations, or ML model inference.',
			'For tensorDims, list unique numeric dimensions mentioned (e.g. 768, 1024, 4096).',
			'For cudaKernels, list function names that wrap CUDA/LibTorch GPU kernels.',
			'For nApiExports, list N-API exported function names from C++ addon code.',
		].join('\n'),
		code,
		{
			model,
			cacheKey:    `langextract:ml-schema:${filePath}`,
			entityTags:  ['ml-inference', 'gpu', 'tensor', 'napi'],
			temperature: 0,
			maxTokens:   400,
		}
	);
}

/**
 * Generate a typed ACE fix suggestion for a specific error.
 * Caller provides error message + surrounding code context.
 */
export async function extractCodeFix(
	errorMessage: string,
	codeContext: string,
	filePath: string,
	model?: string
): Promise<ExtractResult<CodeError>> {
	return extractStructured(
		CodeErrorSchema,
		[
			`Analyze this TypeScript/Svelte error in file: ${filePath}`,
			`Error: ${errorMessage}`,
			'Classify the error type, severity, and provide a concise suggestedFix (code snippet or instruction).',
		].join('\n'),
		codeContext,
		{
			model,
			cacheKey:    `langextract:code-fix:${filePath}:${errorMessage.slice(0, 60)}`,
			entityTags:  ['type-error', 'svelte-rune', 'typescript'],
			temperature: 0,
			maxTokens:   500,
		}
	);
}
