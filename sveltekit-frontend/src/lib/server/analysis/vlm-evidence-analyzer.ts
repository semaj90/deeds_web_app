/**
 * VLM Evidence Analyzer — Server-side image analysis for evidence pipeline
 *
 * Shared function used by:
 *   - /api/evidence/upload (background processing, stage 6b)
 *   - /api/vision/analyze (standalone vision endpoint)
 *
 * Inference path:
 *   1. Triton VLM ensemble (SigLIP → Projector → Gemma3) — fastest when available
 *   2. Ollama multimodal (gemma3-legal + images[]) — always-available fallback
 *
 * Resizes images to 896×896 (Gemma3 SigLIP native resolution) before inference.
 */

import crypto from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { resizeForVLM, GEMMA3_VLM_SIZE } from '$lib/server/image/resize-for-vlm.js';
import { getVLMCache, setVLMCache } from '$lib/server/vector-cache.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface VLMAnalysisResult {
	summary: string;
	keyFindings: string[];
	suggestedTags: string[];
	model: string;
	cached: boolean;
	resizeMeta: {
		resized: boolean;
		originalWidth: number;
		originalHeight: number;
		vlmSize: number;
	};
}

export interface VLMAnalysisInput {
	buffer: Buffer;
	fileName: string;
	/** Existing YOLO/layout detections to include in the prompt for richer context */
	detectionContext?: string;
	/** Evidence-specific prompt override */
	promptOverride?: string;
	/** Skip Redis cache check */
	skipCache?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TRITON_TIMEOUT = 120_000;
const OLLAMA_TIMEOUT = 120_000;

const getTritonUrl = () => (ENV.TRITON_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const getVlmModel = () => ENV.TRITON_VLM_MODEL ?? 'gemma_vlm_ensemble';

const DEFAULT_EVIDENCE_PROMPT = `Analyze this document/evidence image for a legal case investigation.

Provide:
1. A brief summary of what the image contains (1-2 sentences)
2. Key findings relevant to legal proceedings (bullet points)
3. Suggested tags for categorization

Respond in JSON format:
{"summary": "...", "keyFindings": ["..."], "suggestedTags": ["..."]}`;

// ── Helpers ────────────────────────────────────────────────────────────────

async function checkTritonVLMReady(): Promise<boolean> {
	try {
		const res = await fetch(`${getTritonUrl()}/v2/health/ready`, {
			signal: AbortSignal.timeout(2000),
		});
		if (!res.ok) return false;
		// Also verify VLM model specifically
		const modelRes = await fetch(
			`${getTritonUrl()}/v2/models/${encodeURIComponent(getVlmModel())}/ready`,
			{ signal: AbortSignal.timeout(2000) }
		);
		return modelRes.ok;
	} catch {
		return false;
	}
}

function buildPrompt(input: VLMAnalysisInput): string {
	if (input.promptOverride) return input.promptOverride;

	const detectionLine = input.detectionContext
		? `\nDetected regions: ${input.detectionContext}`
		: '';

	return `Analyze this document/evidence image for a legal case investigation.${detectionLine}

Provide:
1. A brief summary of what the image contains (1-2 sentences)
2. Key findings relevant to legal proceedings (bullet points)
3. Suggested tags for categorization

Respond in JSON format:
{"summary": "...", "keyFindings": ["..."], "suggestedTags": ["..."]}`;
}

function parseVLMResponse(text: string): { summary: string; keyFindings: string[]; suggestedTags: string[] } {
	const fallback = {
		summary: text.slice(0, 500),
		keyFindings: [] as string[],
		suggestedTags: [] as string[],
	};

	try {
		// Strip markdown code blocks if present
		const cleaned = text.replace(/^```json?\n?|\n?```$/g, '').trim();
		const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return fallback;

		const parsed = JSON.parse(jsonMatch[0]);
		return {
			summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
			keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
			suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
		};
	} catch {
		return fallback;
	}
}

// ── Triton VLM Path ────────────────────────────────────────────────────────

async function inferTritonVLM(
	base64Image: string,
	prompt: string,
	maxTokens: number
): Promise<string | null> {
	try {
		const res = await fetch(
			`${getTritonUrl()}/v2/models/${encodeURIComponent(getVlmModel())}/infer`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					inputs: [
						{
							name: 'pixel_values',
							shape: [1, 3, GEMMA3_VLM_SIZE, GEMMA3_VLM_SIZE],
							datatype: 'FP32',
							data: base64Image,
						},
						{
							name: 'input_ids',
							shape: [1, -1],
							datatype: 'INT64',
							data: prompt,
						},
					],
					parameters: { max_tokens: maxTokens, temperature: 0.1 },
				}),
				signal: AbortSignal.timeout(TRITON_TIMEOUT),
			}
		);

		if (!res.ok) return null;
		const result = await res.json();
		return result.outputs?.[0]?.data ?? null;
	} catch {
		return null;
	}
}

// ── Ollama VLM Path ────────────────────────────────────────────────────────

async function inferOllamaVLM(
	base64Image: string,
	prompt: string,
	maxTokens: number
): Promise<string | null> {
	try {
		const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				images: [base64Image],
				stream: false,
				options: { temperature: 0.1, num_predict: maxTokens },
			}),
			signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
		});

		if (!ollamaRes.ok) return null;
		const data = await ollamaRes.json();
		return data.response ?? null;
	} catch {
		return null;
	}
}

// ── Main Function ──────────────────────────────────────────────────────────

/**
 * Analyze an evidence image using VLM (Triton → Ollama fallback).
 *
 * Returns structured analysis with summary, key findings, and suggested tags.
 * Results are cached by image SHA-256 hash in Redis (24h TTL).
 */
export async function analyzeEvidenceImage(input: VLMAnalysisInput): Promise<VLMAnalysisResult> {
	// 1. Compute hash for cache key
	const imageHash = crypto.createHash('sha256').update(input.buffer).digest('hex');

	// 2. Resize to Gemma3 native 896×896
	const resized = await resizeForVLM(input.buffer).catch(() => ({
		buffer: input.buffer,
		originalWidth: 0,
		originalHeight: 0,
		resized: false,
		mimeType: 'image/jpeg' as const,
	}));

	const resizeMeta = {
		resized: resized.resized,
		originalWidth: resized.originalWidth,
		originalHeight: resized.originalHeight,
		vlmSize: GEMMA3_VLM_SIZE,
	};

	// 3. Check cache
	if (!input.skipCache) {
		try {
			const { entry: cachedVLM } = await getVLMCache(imageHash, 'evidence');
			if (cachedVLM) {
				console.log(`[VLM] Cache HIT for ${input.fileName} (hash=${imageHash.slice(0, 8)})`);
				return {
					summary: cachedVLM.result.description,
					keyFindings: cachedVLM.result.labels.map(
						(l) => `${l.label} (${(l.confidence * 100).toFixed(0)}%)`
					),
					suggestedTags: cachedVLM.result.labels.map((l) => l.label),
					model: 'cached',
					cached: true,
					resizeMeta,
				};
			}
		} catch {
			/* cache miss */
		}
	}

	// 4. Build prompt
	const prompt = buildPrompt(input);
	const base64Image = resized.buffer.toString('base64');
	const maxTokens = 512;

	// 5. Try Triton VLM first
	let responseText: string | null = null;
	let model = 'unknown';

	const tritonReady = await checkTritonVLMReady();
	if (tritonReady) {
		responseText = await inferTritonVLM(base64Image, prompt, maxTokens);
		if (responseText) {
			model = `triton/${getVlmModel()}`;
			console.log(`[VLM] Triton inference complete for ${input.fileName}`);
		}
	}

	// 6. Fallback to Ollama multimodal
	if (!responseText) {
		responseText = await inferOllamaVLM(base64Image, prompt, maxTokens);
		if (responseText) {
			model = 'gemma3-legal (ollama)';
			console.log(`[VLM] Ollama inference complete for ${input.fileName}`);
		}
	}

	// 7. Parse structured response
	if (!responseText) {
		return {
			summary: 'Image analysis unavailable — both Triton and Ollama unreachable',
			keyFindings: [],
			suggestedTags: [],
			model: 'none',
			cached: false,
			resizeMeta,
		};
	}

	const parsed = parseVLMResponse(responseText);

	// 8. Cache result
	try {
		await setVLMCache(imageHash, {
			labels: parsed.suggestedTags.map((t) => ({ label: t, confidence: 0.8 })),
			description: parsed.summary,
			analysisType: 'evidence',
		});
	} catch {
		/* cache write failure is non-fatal */
	}

	return {
		...parsed,
		model,
		cached: false,
		resizeMeta,
	};
}
