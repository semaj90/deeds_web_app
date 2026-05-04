/**
 * VLM Evidence Analyzer — Server-side image analysis for evidence pipeline
 *
 * Shared function used by:
 *   - /api/evidence/upload (background processing, stage 6b)
 *   - /api/vision/analyze (standalone vision endpoint)
 *
 * Inference path:
 *   1. Triton VLM ensemble (SigLIP → Projector → Gemma4) — fastest when available
 *   2. TurboQuant llama-server with --mmproj (:8090) — unified text+vision
 *   3. Ollama multimodal (gemma4:e4b + images[]) — always-available fallback
 *
 * Resizes images to max 2048px edge (Gemma4 variable token budget) before inference.
 */

import crypto from 'crypto';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { resizeForVLM, GEMMA4_VLM_MAX_EDGE } from '$lib/server/image/resize-for-vlm.js';
import { getVLMCache, setVLMCache } from '$lib/server/vector-cache.js';
import { TURBOQUANT_BASE_URL } from '$lib/ai/model-ids.js';

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

const getTritonUrl = () => ENV.TRITON_URL.replace(/\/$/, '');
const getVlmModel = () => ENV.TRITON_VLM_MODEL;

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
              shape: [1, 3, GEMMA4_VLM_MAX_EDGE, GEMMA4_VLM_MAX_EDGE],
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
        model: ENV.OLLAMA_VLM_MODEL ?? 'gemma4:e4b-it-q4_K_M',
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

// ── TurboQuant VLM Path (llama-server + mmproj) ───────────────────────────

async function inferTurboQuantVLM(
	base64Image: string,
	prompt: string,
	maxTokens: number
): Promise<string | null> {
	try {
		const healthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;

		const res = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } },
							{ type: 'text', text: prompt },
						],
					},
				],
				max_tokens: maxTokens,
				temperature: 0.1,
				stream: false,
			}),
			signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
		});

		if (!res.ok) return null;
		const data = await res.json();
		const msg = data.choices?.[0]?.message;
		// Prefer content (final answer); only fall back to reasoning_content
		// (chain-of-thought) when content is empty — hide thinking from consumers
		return msg?.content || msg?.reasoning_content || null;
	} catch {
		return null;
	}
}

// ── Main Function ──────────────────────────────────────────────────────────

/**
 * Analyze an evidence image using VLM (Triton → TurboQuant → Ollama fallback).
 *
 * Returns structured analysis with summary, key findings, and suggested tags.
 * Results are cached by image SHA-256 hash in Redis (24h TTL).
 */
export async function analyzeEvidenceImage(input: VLMAnalysisInput): Promise<VLMAnalysisResult> {
	// 1. Compute hash for cache key
	const imageHash = crypto.createHash('sha256').update(input.buffer).digest('hex');

	// 2. Resize to Gemma4 variable-resolution (max 2048px edge)
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
    vlmSize: GEMMA4_VLM_MAX_EDGE,
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

	// 6. Fallback to TurboQuant llama-server (unified VLM via --mmproj)
	if (!responseText) {
		responseText = await inferTurboQuantVLM(base64Image, prompt, maxTokens);
		if (responseText) {
			model = 'gemma4-legal-q8_0 (turboquant)';
			console.log(`[VLM] TurboQuant inference complete for ${input.fileName}`);
		}
	}

	// 7. Fallback to Ollama multimodal
	if (!responseText) {
		responseText = await inferOllamaVLM(base64Image, prompt, maxTokens);
		if (responseText) {
			model = `${ENV.OLLAMA_VLM_MODEL ?? 'gemma4:e4b-it-q4_K_M'} (ollama)`;
			console.log(`[VLM] Ollama inference complete for ${input.fileName}`);
		}
	}

	// 8. Parse structured response
	if (!responseText) {
		return {
			summary: 'Image analysis unavailable — Triton, TurboQuant, and Ollama all unreachable',
			keyFindings: [],
			suggestedTags: [],
			model: 'none',
			cached: false,
			resizeMeta,
		};
	}

	const parsed = parseVLMResponse(responseText);

	// 9. Cache result
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
