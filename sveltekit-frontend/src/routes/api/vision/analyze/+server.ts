import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { redis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { uploadFile } from '$lib/server/minio-client.js';
import { createYOLOService, type YOLOResult } from '$lib/server/yolo.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const BUCKET = ENV.MINIO_EVIDENCE_BUCKET;
const CACHE_TTL = 24 * 60 * 60; // 24h

interface VisionBox {
	x: number;
	y: number;
	w: number;
	h: number;
	label: string;
	conf: number;
}

interface VisionResponse {
	cacheHit: boolean;
	hash: string;
	boxes: VisionBox[];
	analysis: {
		summary: string;
		keyFindings: string[];
		suggestedTags: string[];
	};
	timingsMs: Record<string, number>;
	minioUrl?: string;
}

/**
 * POST /api/vision/analyze
 * Pipeline: SHA-256 hash → Redis cache check → YOLO detection → Gemma3 VLM analysis → cache result
 */
export const POST: RequestHandler = async ({ request }) => {
	const timings: Record<string, number> = {};
	const t0 = Date.now();

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file || typeof file.arrayBuffer !== 'function') {
			return json({ error: 'No image file provided' }, { status: 400 });
		}

		// Validate image type
		if (!file.type.startsWith('image/')) {
			return json({ error: 'File must be an image (JPEG, PNG, WebP, etc.)' }, { status: 400 });
		}

		if (file.size > 50 * 1024 * 1024) {
			return json({ error: 'Image too large. Maximum 50MB.' }, { status: 400 });
		}

		const visionMetaSchema = z.object({
			caseId: z.string().max(500).nullable().optional().default(null),
			evidenceId: z.string().max(500).nullable().optional().default(null),
			skipCache: z.boolean().optional().default(false),
		});
		const metaParsed = visionMetaSchema.safeParse({
			caseId: formData.get('caseId')?.toString() || null,
			evidenceId: formData.get('evidenceId')?.toString() || null,
			skipCache: formData.get('skipCache') === 'true',
		});
		if (!metaParsed.success) {
			return json({ error: metaParsed.error.issues[0]?.message ?? 'Invalid metadata' }, { status: 400 });
		}
		const { caseId, evidenceId, skipCache } = metaParsed.data;

		// 1. Read buffer + compute hash
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex');
		timings.hash = Date.now() - t0;

		// 2. Check Redis cache
		if (!skipCache) {
			try {
				const cached = await redis.get(`vision:${hash}`);
				if (cached) {
					const result: VisionResponse = JSON.parse(cached);
					result.cacheHit = true;
					result.timingsMs = { ...timings, total: Date.now() - t0 };
					return json(result);
				}
			} catch {
				// Redis unavailable — proceed without cache
			}
		}
		timings.cacheCheck = Date.now() - t0;

		// 3. Upload to MinIO (async, non-blocking for analysis)
		let minioUrl: string | undefined;
		const minioPromise = (async () => {
			try {
				const ext = file.name.split('.').pop() ?? 'jpg';
				const ts = new Date().toISOString().replace(/[:.]/g, '-');
				const objectKey = `vision/${caseId ?? 'general'}/${ts}-${hash.slice(0, 8)}.${ext}`;
				await uploadFile(BUCKET, objectKey, buffer, {
					'Content-Type': file.type,
					'X-Vision-Hash': hash,
				});
				minioUrl = `minio://${BUCKET}/${objectKey}`;
			} catch (err) {
				console.warn('[vision] MinIO upload failed (non-critical):', err);
			}
		})();

		// 4. YOLO detection
		const tYolo = Date.now();
		let boxes: VisionBox[] = [];
		let yoloResult: YOLOResult | null = null;

		try {
			const yolo = createYOLOService();
			const modelAvailable = await yolo.isModelAvailable();

			if (modelAvailable) {
				yoloResult = await yolo.analyzeDocument(buffer, file.name);
				boxes = (yoloResult.objects ?? []).map((obj) => ({
					x: obj.bbox[0],
					y: obj.bbox[1],
					w: obj.bbox[2] - obj.bbox[0],
					h: obj.bbox[3] - obj.bbox[1],
					label: obj.class,
					conf: obj.confidence,
				}));

				// Also add layout regions as boxes
				for (const region of yoloResult.layout?.regions ?? []) {
					boxes.push({
						x: region.bbox[0],
						y: region.bbox[1],
						w: region.bbox[2] - region.bbox[0],
						h: region.bbox[3] - region.bbox[1],
						label: region.type,
						conf: region.confidence,
					});
				}
			}
		} catch (err) {
			console.warn('[vision] YOLO detection failed (non-critical):', err);
		}
		timings.yolo = Date.now() - tYolo;

		// 5. Gemma3 VLM analysis via Ollama
		const tVlm = Date.now();
		let analysis = {
			summary: 'Image analysis unavailable',
			keyFindings: [] as string[],
			suggestedTags: [] as string[],
		};

		try {
			const detectionContext = boxes.length > 0
				? `\nDetected regions: ${boxes.map((b) => `${b.label} (${(b.conf * 100).toFixed(0)}%)`).join(', ')}`
				: '';

			const prompt = `Analyze this document/evidence image for a legal case investigation.${detectionContext}

Provide:
1. A brief summary of what the image contains (1-2 sentences)
2. Key findings relevant to legal proceedings (bullet points)
3. Suggested tags for categorization

Respond in JSON format:
{"summary": "...", "keyFindings": ["..."], "suggestedTags": ["..."]}`;

			// Convert image to base64 for Ollama multimodal
			const base64Image = buffer.toString('base64');

			const ollamaRes = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt,
					images: [base64Image],
					stream: false,
					options: { temperature: 0.1, num_predict: 512 },
				}),
			});

			if (ollamaRes.ok) {
				const ollamaData = await ollamaRes.json();
				const responseText = ollamaData.response ?? '';

				// Try to parse JSON from response
				const jsonMatch = responseText.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					const parsed = JSON.parse(jsonMatch[0]);
					analysis = {
						summary: parsed.summary ?? analysis.summary,
						keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
						suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
					};
				} else {
					// Fallback: use raw text as summary
					analysis.summary = responseText.slice(0, 500);
				}
			}
		} catch (err) {
			console.warn('[vision] VLM analysis failed (non-critical):', err);
		}
		timings.vlm = Date.now() - tVlm;

		// Wait for MinIO upload
		await minioPromise;
		timings.total = Date.now() - t0;

		const result: VisionResponse = {
			cacheHit: false,
			hash,
			boxes,
			analysis,
			timingsMs: timings,
			minioUrl,
		};

		// 6. Cache result in Redis
		try {
			await redis.set(`vision:${hash}`, JSON.stringify(result), 'EX', CACHE_TTL);
		} catch {
			// Redis unavailable — non-critical
		}

		return json(result);
	} catch (err) {
		console.error('[vision] Analysis failed:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Vision analysis failed' },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/vision/analyze?hash=<sha256>
 * Check if a cached analysis exists for a given image hash
 */
export const GET: RequestHandler = async ({ url }) => {
	const hash = url.searchParams.get('hash');
	if (!hash) {
		return json({ error: 'Missing hash parameter' }, { status: 400 });
	}

	try {
		const cached = await redis.get(`vision:${hash}`);
		if (cached) {
			return json({ found: true, result: JSON.parse(cached) });
		}
		return json({ found: false });
	} catch {
		return json({ found: false, error: 'Cache unavailable' });
	}
};