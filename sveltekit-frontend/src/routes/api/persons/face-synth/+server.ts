/**
 * POST /api/persons/face-synth
 *
 * QLoRA synthetic data generator for POI face identity fine-tuning.
 *
 * Generates JSONL training pairs:
 *   { "instruction": "...", "input": "<image: base64>", "output": "..." }
 *
 * Three synthesis modes:
 *   "description" — gemma4 describes each POI photo → (image, description) pairs
 *   "compare"     — gemma4 compares same-person photo pairs → positive/negative contrast pairs
 *   "adversarial" — gemma4 generates "looks similar but different" pairs from different POIs
 *
 * Output is written to qlora_examples table (existing) and returned as JSONL download.
 * Accessible from /admin/face-gallery admin dashboard.
 *
 * Body: { poiIds?: string[], mode?: "description"|"compare"|"adversarial", limit?: number }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos } from '$lib/server/db/schema-postgres.js';
import { eq, sql, desc } from 'drizzle-orm';
import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

const bodySchema = z.object({
  poiIds: z.array(z.string().max(500)).max(50).optional(),
  mode: z.enum(['description', 'compare', 'adversarial']).optional().default('description'),
  limit: z.number().int().min(1).max(200).optional().default(50),
  download: z.boolean().optional().default(false),
});

const MODEL = () => ENV.OLLAMA_VLM_MODEL ?? ENV.GEMMA4_MODEL ?? 'gemma4-legal-vlm:latest';
const OLLAMA = () => ENV.OLLAMA_BASE_URL.replace(/\/$/, '');

function minioInternalBase(): string {
  const proto = ENV.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return `${proto}://${ENV.MINIO_ENDPOINT}:${ENV.MINIO_PORT}`;
}

async function fetchBase64(url: string): Promise<string | null> {
  try {
    // Replace any MinIO public hostname with the internal address
    const publicBase = url.match(/^https?:\/\/[^/]+/)?.[0] ?? '';
    const internal = publicBase ? url.replace(publicBase, minioInternalBase()) : url;
    const r = await fetch(internal, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

async function vlmDescribe(imgB64: string, poiName: string): Promise<string> {
  try {
    const res = await ollamaFetch(`${OLLAMA()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        messages: [{
          role: 'user',
          content: `Describe the physical appearance of the person in this photo (${poiName}). Focus on distinguishing features useful for forensic identification: face shape, hair, eyes, nose, skin tone, approximate age. Be objective and precise. 2-4 sentences.`,
          images: [imgB64],
        }],
        stream: false,
        options: { temperature: 0.3, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return String(d?.message?.content ?? '').slice(0, 600);
  } catch {
    return '';
  }
}

async function vlmCompare(imgA: string, imgB: string, samePersonName: string | null): Promise<string> {
  const isSame = samePersonName !== null;
  const label = isSame ? `Both photos show ${samePersonName}.` : 'These photos show different people.';
  try {
    const res = await ollamaFetch(`${OLLAMA()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        messages: [{
          role: 'user',
          content: `Compare these two photos for forensic face matching. ${label} Explain which facial features confirm or deny identity. 2-3 sentences.`,
          images: [imgA, imgB],
        }],
        stream: false,
        options: { temperature: 0.3, num_predict: 400 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return '';
    const d = await res.json();
    return String(d?.message?.content ?? '').slice(0, 800);
  } catch {
    return '';
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  // Admin-only gate
  if (locals.user.role !== 'admin') {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });

  const { poiIds, mode, limit, download } = parsed.data;

  // Load POIs + photos
  let poiQuery = db
    .select({ id: personsOfInterest.id, name: personsOfInterest.name })
    .from(personsOfInterest)
    .limit(Math.min(50, limit))
    .$dynamic();

  const pois = await poiQuery;
  const poiList = poiIds && poiIds.length > 0
    ? pois.filter((p: { id: string }) => poiIds.filter(isUuid).includes(p.id))
    : pois;

  if (poiList.length === 0) {
    return json({ examples: [], count: 0, mode, message: 'No POIs found' });
  }

  // Load latest photos per POI (up to 3 each)
  const poiIdArr = poiList.map((p: { id: string }) => p.id);
  const photos = await db
    .select({ poiId: poiPhotos.poiId, thumbnailUrl: poiPhotos.thumbnailUrl, id: poiPhotos.id })
    .from(poiPhotos)
    .where(sql`${poiPhotos.poiId} = ANY(${poiIdArr})`)
    .orderBy(desc(poiPhotos.uploadedAt));

  const photosByPoi = new Map<string, Array<{ id: string; thumbnailUrl: string | null }>>();
  for (const p of photos) {
    if (!p.poiId) continue;
    const arr = photosByPoi.get(p.poiId) ?? [];
    if (arr.length < 3) arr.push({ id: p.id, thumbnailUrl: p.thumbnailUrl });
    photosByPoi.set(p.poiId, arr);
  }

  const examples: Array<{ instruction: string; input: string; output: string; poiId: string; mode: string }> = [];

  // ── Mode: description ────────────────────────────────────────────────────
  if (mode === 'description') {
    for (const poi of poiList) {
      const photos = photosByPoi.get(poi.id) ?? [];
      for (const photo of photos.slice(0, 2)) {
        if (!photo.thumbnailUrl) continue;
        const b64 = await fetchBase64(photo.thumbnailUrl);
        if (!b64) continue;
        const description = await vlmDescribe(b64, poi.name ?? 'Unknown');
        if (!description) continue;
        examples.push({
          instruction: 'Describe the physical appearance of the person in this photo for forensic identification.',
          input: `[IMAGE: poi_photo:${photo.id}]`,
          output: description,
          poiId: poi.id,
          mode: 'description',
        });
        if (examples.length >= limit) break;
      }
      if (examples.length >= limit) break;
    }
  }

  // ── Mode: compare (positive pairs — same person, different photos) ────────
  if (mode === 'compare') {
    for (const poi of poiList) {
      const photos = photosByPoi.get(poi.id) ?? [];
      if (photos.length < 2) continue;
      const [pA, pB] = photos;
      if (!pA.thumbnailUrl || !pB.thumbnailUrl) continue;
      const [b64A, b64B] = await Promise.all([fetchBase64(pA.thumbnailUrl), fetchBase64(pB.thumbnailUrl)]);
      if (!b64A || !b64B) continue;
      const reasoning = await vlmCompare(b64A, b64B, poi.name ?? 'Unknown');
      if (!reasoning) continue;
      // Positive pair
      examples.push({
        instruction: 'Do these two photos show the same person? Explain your reasoning.',
        input: `[IMAGE_A: poi_photo:${pA.id}] [IMAGE_B: poi_photo:${pB.id}]`,
        output: `Yes. ${reasoning}`,
        poiId: poi.id,
        mode: 'compare-positive',
      });
      if (examples.length >= limit) break;
    }

    // Negative pairs — different POIs
    const shuffled = [...poiList].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < shuffled.length && examples.length < limit; i++) {
      const pA = (photosByPoi.get(shuffled[i].id) ?? [])[0];
      const pB = (photosByPoi.get(shuffled[i + 1].id) ?? [])[0];
      if (!pA?.thumbnailUrl || !pB?.thumbnailUrl) continue;
      const [b64A, b64B] = await Promise.all([fetchBase64(pA.thumbnailUrl), fetchBase64(pB.thumbnailUrl)]);
      if (!b64A || !b64B) continue;
      const reasoning = await vlmCompare(b64A, b64B, null);
      if (!reasoning) continue;
      examples.push({
        instruction: 'Do these two photos show the same person? Explain your reasoning.',
        input: `[IMAGE_A: poi_photo:${pA.id}] [IMAGE_B: poi_photo:${pB.id}]`,
        output: `No. ${reasoning}`,
        poiId: `${shuffled[i].id}:${shuffled[i + 1].id}`,
        mode: 'compare-negative',
      });
    }
  }

  // ── Mode: adversarial (hard negatives via gemma4 confusability prompt) ────
  if (mode === 'adversarial') {
    const shuffled = [...poiList].sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < shuffled.length && examples.length < limit; i++) {
      const photoA = (photosByPoi.get(shuffled[i].id) ?? [])[0];
      const photoB = (photosByPoi.get(shuffled[i + 1].id) ?? [])[0];
      if (!photoA?.thumbnailUrl || !photoB?.thumbnailUrl) continue;
      const [b64A, b64B] = await Promise.all([fetchBase64(photoA.thumbnailUrl), fetchBase64(photoB.thumbnailUrl)]);
      if (!b64A || !b64B) continue;
      // Ask gemma4 to identify the most confusable features, then generate a hard-negative label
      const reasoning = await vlmCompare(b64A, b64B, null);
      if (!reasoning) continue;
      examples.push({
        instruction: 'These photos may look similar. Are they the same person? Identify any confusable features and explain why they are in fact different individuals.',
        input: `[IMAGE_A: poi_photo:${photoA.id}] [IMAGE_B: poi_photo:${photoB.id}]`,
        output: `No, these are different individuals. ${reasoning}`,
        poiId: `${shuffled[i].id}:${shuffled[i + 1].id}`,
        mode: 'adversarial',
      });
    }
  }

  // ── Persist to qlora_examples if table exists ─────────────────────────────
  let persisted = 0;
  if (examples.length > 0) {
    try {
      await db.execute(sql`
        INSERT INTO qlora_examples (query, response, pipeline, quality_tier, metadata)
        SELECT
          x.instruction,
          x.output,
          'face-synth',
          CASE WHEN x.mode LIKE 'compare%' THEN 'gold' WHEN x.mode = 'adversarial' THEN 'silver' ELSE 'standard' END,
          jsonb_build_object('mode', x.mode, 'poiId', x.poi_id, 'inputRef', x.input_ref)
        FROM jsonb_to_recordset(${JSON.stringify(
          examples.map(e => ({ instruction: e.instruction, output: e.output, mode: e.mode, poi_id: e.poiId, input_ref: e.input }))
        )}::jsonb) AS x(instruction text, output text, mode text, poi_id text, input_ref text)
        ON CONFLICT DO NOTHING
      `);
      persisted = examples.length;
    } catch {
      // qlora_examples may not have these columns — continue silently
    }
  }

  if (download) {
    // Return as JSONL download
    const jsonl = examples.map(e => JSON.stringify({ instruction: e.instruction, input: e.input, output: e.output })).join('\n');
    return new Response(jsonl, {
      headers: {
        'Content-Type': 'application/jsonl',
        'Content-Disposition': `attachment; filename="face-synth-${mode}-${Date.now()}.jsonl"`,
      },
    });
  }

  return json({
    count: examples.length,
    persisted,
    mode,
    examples: examples.slice(0, 20), // preview — full set via download=true
    message: `Generated ${examples.length} training examples (${persisted} persisted to qlora_examples).`,
  });
};
