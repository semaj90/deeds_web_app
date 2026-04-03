/**
 * POST /api/vision/analyze
 * Pipeline: SHA-256 hash → Redis cache check → YOLO detection → VLM analysis (Triton → Ollama) → cache
 *
 * GET /api/vision/analyze?hash=<sha256>
 * Check if a cached analysis exists for a given image hash
 */
import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { redis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import { uploadFile } from '$lib/server/minio-client.js';
import { createYOLOService, type YOLOResult } from '$lib/server/yolo.js';
import { GEMMA3_VLM_SIZE } from '$lib/server/image/resize-for-vlm.js';
import { analyzeEvidenceImage } from '$lib/server/analysis/vlm-evidence-analyzer.js';

const BUCKET = ENV.MINIO_EVIDENCE_BUCKET;

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
  vlmMeta?: {
    resized: boolean;
    originalWidth: number;
    originalHeight: number;
    vlmWidth: number;
    vlmHeight: number;
  };
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || typeof file.arrayBuffer !== 'function') {
      return json({ error: 'No image file provided' }, { status: 400 });
    }

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
      return json(
        { error: metaParsed.error.issues[0]?.message ?? 'Invalid metadata' },
        { status: 400 }
      );
    }
    const { caseId, skipCache } = metaParsed.data;
    // evidenceId available in metaParsed.data if needed for future per-evidence tracking

    // 1. Read buffer + compute hash
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    timings.hash = Date.now() - t0;

    // 2. Check Redis full-response cache (includes YOLO boxes + VLM analysis)
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
        // Redis unavailable
      }
    }
    timings.cacheCheck = Date.now() - t0;

    // 3. Upload to MinIO (async, non-blocking)
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

    // 4. YOLO detection (uses original buffer for pixel-accurate coords)
    const tYolo = Date.now();
    let boxes: VisionBox[] = [];

    try {
      const yolo = createYOLOService();
      const modelAvailable = await yolo.isModelAvailable();

      if (modelAvailable) {
        const yoloResult: YOLOResult = await yolo.analyzeDocument(buffer, file.name);
        boxes = (yoloResult.objects ?? []).map((obj) => ({
          x: obj.bbox[0],
          y: obj.bbox[1],
          w: obj.bbox[2] - obj.bbox[0],
          h: obj.bbox[3] - obj.bbox[1],
          label: obj.class,
          conf: obj.confidence,
        }));

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

    // 5. VLM analysis (Triton → Ollama fallback) via shared analyzer
    const tVlm = Date.now();
    const detectionContext = boxes.length > 0
      ? boxes.map((b) => `${b.label} (${(b.conf * 100).toFixed(0)}%)`).join(', ')
      : undefined;

    const vlmResult = await analyzeEvidenceImage({
      buffer,
      fileName: file.name,
      detectionContext,
      skipCache,
    });
    timings.vlm = Date.now() - tVlm;

    // Wait for MinIO upload
    await minioPromise;
    timings.total = Date.now() - t0;

    const result: VisionResponse = {
      cacheHit: false,
      hash,
      boxes,
      analysis: {
        summary: vlmResult.summary,
        keyFindings: vlmResult.keyFindings,
        suggestedTags: vlmResult.suggestedTags,
      },
      timingsMs: timings,
      minioUrl,
      vlmMeta: {
        resized: vlmResult.resizeMeta.resized,
        originalWidth: vlmResult.resizeMeta.originalWidth,
        originalHeight: vlmResult.resizeMeta.originalHeight,
        vlmWidth: GEMMA3_VLM_SIZE,
        vlmHeight: GEMMA3_VLM_SIZE,
      },
    };

    // Cache the full response in Redis (24h TTL)
    try {
      await redis.set(`vision:${hash}`, JSON.stringify(result), 'EX', 24 * 60 * 60);
    } catch {
      /* non-fatal */
    }

    return json(result);
  } catch (err) {
    console.error('[vision] Analysis failed:', err);
    return json(
      { error: 'Vision analysis failed' },
      { status: 500 }
    );
  }
};

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
