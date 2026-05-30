/**
 * POST /api/persons-of-interest/[id]/face-rerank
 *
 * GRPO-style multi-pass face reranker for POI identity matching.
 *
 * Pass 1 — embedding cosine similarity (768-dim face vectors from pgvector)
 * Pass 2 — VLM visual reasoning (gemma4-rotorquant:latest / gemma3 via Ollama):
 *           "Do these photos show the same person?"  → confidence 0–100
 * Pass 3 — GRPO reward: 0.35 * pass1 + 0.65 * pass2  (preference-weighted)
 *
 * Body: { candidateIds?: string[], limit?: number, passes?: 1 | 2 | 3 }
 * The [id] param is the reference POI whose photos are compared against candidates.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos } from '$lib/server/db/schema-postgres.js';
import { and, eq, inArray, ne, sql, isNull, or, desc } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

const bodySchema = z.object({
  candidateIds: z.array(z.string().max(500)).max(50).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  passes: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().default(3),
});

/** Cosine similarity between two equal-length float arrays */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Fetch image bytes from MinIO URL and return as base64 */
async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const proto = ENV.MINIO_USE_SSL === 'true' ? 'https' : 'http';
    const internalBase = `${proto}://${ENV.MINIO_ENDPOINT}:${ENV.MINIO_PORT}`;
    const publicBase = url.match(/^https?:\/\/[^/]+/)?.[0] ?? '';
    const internalUrl = publicBase ? url.replace(publicBase, internalBase) : url;
    const res = await fetch(internalUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf).toString('base64');
  } catch {
    return null;
  }
}

/** Ask VLM: "same person?" → confidence 0–1 */
async function vlmFaceScore(
  refBase64: string,
  candBase64: string,
  refName: string,
  candName: string
): Promise<{ confidence: number; reasoning: string }> {
  const OLLAMA_BASE = ENV.OLLAMA_BASE_URL.replace(/\/$/, '');
  const model = ENV.OLLAMA_VLM_MODEL ?? ENV.GEMMA4_MODEL ?? 'gemma4-rotorquant:latest';

  const prompt =
    `You are a forensic facial recognition assistant. ` +
    `Compare the two photos provided (reference: ${refName}, candidate: ${candName}). ` +
    `Determine whether both photos depict the same individual. ` +
    `Reply ONLY with valid JSON: {"match": true|false, "confidence": 0-100, "reasoning": "<1-2 sentences>"}`;

  try {
    const res = await ollamaFetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [refBase64, candBase64],
          },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return { confidence: 0, reasoning: 'VLM unavailable' };
    const data = await res.json();
    const text: string = data?.message?.content ?? '';

    // Extract JSON from model output (may include markdown fences)
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return { confidence: 0, reasoning: text.slice(0, 120) };
    const parsed = JSON.parse(match[0]);
    return {
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence ?? 0))) / 100,
      reasoning: String(parsed.reasoning ?? '').slice(0, 300),
    };
  } catch {
    return { confidence: 0, reasoning: 'VLM error' };
  }
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

  const refPoiId = params.id;
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid request body' }, { status: 400 });

  const { candidateIds, limit, passes } = parsed.data;

  // ── Load reference POI + their best photo ─────────────────────────────────
  const [refPoi] = await db
    .select({ id: personsOfInterest.id, name: personsOfInterest.name })
    .from(personsOfInterest)
    .where(and(
      eq(personsOfInterest.id, refPoiId),
      or(eq(personsOfInterest.createdBy, Number(locals.user.id)), isNull(personsOfInterest.createdBy))
    ))
    .limit(1);

  if (!refPoi) return json({ error: 'Reference POI not found' }, { status: 404 });

  const [refPhoto] = await db
    .select({ faceEmbedding: poiPhotos.faceEmbedding, thumbnailUrl: poiPhotos.thumbnailUrl })
    .from(poiPhotos)
    .where(eq(poiPhotos.poiId, refPoiId))
    .orderBy(desc(poiPhotos.uploadedAt))
    .limit(1);

  const refEmb: number[] | null =
    Array.isArray(refPhoto?.faceEmbedding) && refPhoto.faceEmbedding.length === 768
      ? (refPhoto.faceEmbedding as number[])
      : null;

  const refThumbnail = refPhoto?.thumbnailUrl ?? null;

  // ── Load candidates ────────────────────────────────────────────────────────
  let candidateQuery = db
    .select({
      id: personsOfInterest.id,
      name: personsOfInterest.name,
      status: personsOfInterest.status,
      threatLevel: personsOfInterest.threatLevel,
    })
    .from(personsOfInterest)
    .where(
      and(
        ne(personsOfInterest.id, refPoiId),
        or(eq(personsOfInterest.createdBy, Number(locals.user.id)), isNull(personsOfInterest.createdBy)),
        ...(candidateIds && candidateIds.length > 0
          ? [inArray(personsOfInterest.id, candidateIds.filter(isUuid))]
          : [])
      )
    )
    .limit(limit ?? 20)
    .$dynamic();

  const candidates = await candidateQuery;

  if (candidates.length === 0) {
    return json({ results: [], refPoiId, refName: refPoi.name, passes: 0, message: 'No candidates' });
  }

  // Fetch best photo per candidate (latest uploaded)
  const candIds = candidates.map((c) => c.id);
  const candPhotos = await db
    .select({ poiId: poiPhotos.poiId, faceEmbedding: poiPhotos.faceEmbedding, thumbnailUrl: poiPhotos.thumbnailUrl })
    .from(poiPhotos)
    .where(sql`${poiPhotos.poiId} = ANY(${candIds})`)
    .orderBy(desc(poiPhotos.uploadedAt));

  // Deduplicate: keep only first (latest) photo per POI
  const photoByPoiId = new Map<string, { faceEmbedding: unknown; thumbnailUrl: string | null }>();
  for (const p of candPhotos) {
    if (p.poiId && !photoByPoiId.has(p.poiId)) {
      photoByPoiId.set(p.poiId, { faceEmbedding: p.faceEmbedding, thumbnailUrl: p.thumbnailUrl });
    }
  }

  // ── Pass 1: Embedding cosine similarity ───────────────────────────────────
  type RankedCandidate = {
    poiId: string;
    name: string;
    status: string | null;
    threatLevel: string | null;
    thumbnailUrl: string | null;
    pass1Score: number;
    pass2Score: number;
    pass2Reasoning: string;
    grpoReward: number;
    hasEmbedding: boolean;
  };

  const ranked: RankedCandidate[] = candidates.map((cand) => {
    const photo = photoByPoiId.get(cand.id);
    const candEmb =
      Array.isArray(photo?.faceEmbedding) && (photo.faceEmbedding as number[]).length === 768
        ? (photo.faceEmbedding as number[])
        : null;

    const pass1 = refEmb && candEmb ? cosine(refEmb, candEmb) : 0;

    return {
      poiId: cand.id,
      name: cand.name ?? 'Unknown',
      status: cand.status,
      threatLevel: cand.threatLevel,
      thumbnailUrl: photo?.thumbnailUrl ?? null,
      pass1Score: Math.max(0, Math.min(1, (pass1 + 1) / 2)), // normalize -1..1 → 0..1
      pass2Score: 0,
      pass2Reasoning: '',
      grpoReward: 0,
      hasEmbedding: candEmb !== null,
    };
  });

  // Sort by pass1 to gate pass2 on top-K
  ranked.sort((a, b) => b.pass1Score - a.pass1Score);

  const PASS1_ONLY = passes === 1;
  const PASS2_TOP_K = passes >= 2 ? 10 : 0;

  // ── Pass 2: VLM reasoning on top-K candidates ─────────────────────────────
  if (passes >= 2 && refThumbnail) {
    const refBase64 = await fetchImageBase64(refThumbnail);

    if (refBase64) {
      const topK = ranked.slice(0, PASS2_TOP_K);
      await Promise.all(
        topK.map(async (cand) => {
          if (!cand.thumbnailUrl) {
            cand.pass2Score = 0;
            cand.pass2Reasoning = 'No photo available';
            return;
          }
          const candBase64 = await fetchImageBase64(cand.thumbnailUrl);
          if (!candBase64) {
            cand.pass2Score = 0;
            cand.pass2Reasoning = 'Could not load image';
            return;
          }
          const { confidence, reasoning } = await vlmFaceScore(
            refBase64,
            candBase64,
            refPoi.name ?? 'Reference',
            cand.name
          );
          cand.pass2Score = confidence;
          cand.pass2Reasoning = reasoning;
        })
      );
    }
  }

  // ── Pass 3: GRPO reward (preference-weighted combination) ─────────────────
  for (const cand of ranked) {
    if (passes === 1) {
      cand.grpoReward = cand.pass1Score;
    } else if (passes === 2) {
      cand.grpoReward = 0.4 * cand.pass1Score + 0.6 * cand.pass2Score;
    } else {
      // Triple-pass GRPO: embeddings carry less weight once VLM has spoken
      cand.grpoReward = 0.25 * cand.pass1Score + 0.75 * cand.pass2Score;
    }
  }

  // Final sort by GRPO reward
  ranked.sort((a, b) => b.grpoReward - a.grpoReward);

  return json({
    refPoiId,
    refName: refPoi.name,
    refThumbnail,
    passes,
    passesRun: PASS1_ONLY ? 1 : passes >= 2 ? passes : 1,
    results: ranked,
  });
};
