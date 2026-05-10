/**
 * POST /api/evidence/search-by-image
 *
 * Thin route wrapper around $lib/server/vector/image-search.ts
 *
 * Pipeline (in image-search.ts):
 *   1. VLM caption  — analyzeVLMEvidence() — cached by image SHA-256
 *   2. Embed        — embeddinggemma 768-dim
 *   3. Qdrant ANN   — evidence_items (named vector 'content')
 *   4. Tag boost    — VLM tag overlap → +0.15 score per match
 *   5. Rerank cache — ace:img:rerank:{hash} Redis 300s TTL
 *   6. Return       — top-K hits with matched tags + caption
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchByImage } from '$lib/server/vector/image-search.js';
import { z } from 'zod';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const ConfigSchema = z.object({
  collection:     z.string().default('evidence_items'),
  limit:          z.number().int().min(1).max(50).default(10),
  scoreThreshold: z.number().min(0).max(1).default(0.20),
  caseId:         z.string().uuid().optional(),
  tagFilter:      z.string().optional(),
  includeRejected: z.boolean().default(false),
  promptOverride:  z.string().max(1000).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) throw error(400, 'multipart/form-data required');

  const form      = await request.formData();
  const imageFile = form.get('image') as File | null;
  if (!imageFile) throw error(400, 'image field required');
  if (imageFile.size > MAX_IMAGE_BYTES) throw error(413, 'Image exceeds 20MB');

  const configRaw = form.get('config');
  const config    = ConfigSchema.safeParse(configRaw ? JSON.parse(String(configRaw)) : {});
  if (!config.success) throw error(400, config.error.message);

  const buffer = Buffer.from(await imageFile.arrayBuffer());

  try {
    const result = await searchByImage({
      buffer,
      fileName:        imageFile.name,
      collection:      config.data.collection,
      limit:           config.data.limit,
      scoreThreshold:  config.data.scoreThreshold,
      caseId:          config.data.caseId,
      includeRejected: config.data.includeRejected,
      promptOverride:  config.data.promptOverride,
    });

    return json(result);
  } catch (e) {
    const msg = String(e).slice(0, 300);
    if (msg.includes('VLM') || msg.includes('Ollama') || msg.includes('Triton')) {
      throw error(502, `Vision model unavailable: ${msg}`);
    }
    throw error(500, msg);
  }
};
