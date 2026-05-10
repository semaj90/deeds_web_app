/**
 * Weight upload + promote admin endpoint.
 *
 * POST /api/admin/weights          — upload candidate weights
 * POST /api/admin/weights/promote  — promote candidate → live
 * GET  /api/admin/weights          — list stored candidates
 *
 * Security model:
 *   - Admin-only (locals.user.role === 'admin')
 *   - Upload validates SHA-256 before storing
 *   - Candidate stored at  ace:autoencoder:weights:candidate:{version}
 *   - Promote copies candidate → ace:autoencoder:weights:live
 *   - No raw writes to live key without promotion step
 */

import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import type { RequestHandler } from './$types';

const CANDIDATE_PREFIX = 'ace:autoencoder:weights:candidate:';
const LIVE_KEY         = 'ace:autoencoder:weights:live';
const CANDIDATE_TTL    = 7 * 24 * 3600; // 7 days

const UploadSchema = z.object({
  component: z.string().min(1).max(64),
  version:   z.string().regex(/^v\d+\.\d+\.\d+$/, 'version must be semver, e.g. v1.2.3'),
  sha256:    z.string().regex(/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex chars'),
  // Base64-encoded weight bytes (max ~50 MB after decode ≈ 66 MB base64)
  data:      z.string().max(70_000_000),
});

const PromoteSchema = z.object({
  component: z.string().min(1).max(64),
  version:   z.string().regex(/^v\d+\.\d+\.\d+$/),
});

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user || (locals.user as { role?: string }).role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const redis = getRedis();
  try {
    const keys = await redis.keys(`${CANDIDATE_PREFIX}*`);
    const candidates = await Promise.all(
      keys.map(async (k) => {
        const meta = await redis.hgetall(`${k}:meta`);
        return { key: k.replace(CANDIDATE_PREFIX, ''), ...meta };
      })
    );
    const liveVersion = await redis.hget(`${LIVE_KEY}:meta`, 'version');
    return json({ candidates, liveVersion: liveVersion ?? null });
  } catch (e) {
    return json({ candidates: [], liveVersion: null });
  }
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (!locals.user || (locals.user as { role?: string }).role !== 'admin') {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const action = url.searchParams.get('action');

  // ── Promote ────────────────────────────────────────────────────────────────
  if (action === 'promote') {
    const body = await request.json().catch(() => null);
    const parsed = PromoteSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
    }
    const { component, version } = parsed.data;
    const candidateKey = `${CANDIDATE_PREFIX}${component}:${version}`;

    const redis = getRedis();
    const candidateData = await redis.get(candidateKey);
    if (!candidateData) {
      return json({ error: `Candidate ${component}@${version} not found` }, { status: 404 });
    }

    // Atomic promote: copy data + update live meta
    const pipeline = redis.pipeline();
    pipeline.set(LIVE_KEY, candidateData);
    pipeline.hset(`${LIVE_KEY}:meta`, 'component', component, 'version', version, 'promoted_at', new Date().toISOString());
    await pipeline.exec();

    return json({ ok: true, promoted: `${component}@${version}` });
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null);
  const parsed = UploadSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { component, version, sha256, data } = parsed.data;

  // Decode and verify SHA-256
  let bytes: Buffer;
  try {
    bytes = Buffer.from(data, 'base64');
  } catch {
    return json({ error: 'data is not valid base64' }, { status: 400 });
  }

  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash.toLowerCase() !== sha256.toLowerCase()) {
    return json({ error: 'SHA-256 mismatch', expected: sha256, actual: actualHash }, { status: 400 });
  }

  const candidateKey = `${CANDIDATE_PREFIX}${component}:${version}`;
  const redis = getRedis();

  const pipeline = redis.pipeline();
  // Store raw bytes as base64 string (Redis strings can hold binary via base64)
  pipeline.setex(candidateKey, CANDIDATE_TTL, data);
  pipeline.hset(`${candidateKey}:meta`,
    'component',   component,
    'version',     version,
    'sha256',      sha256,
    'bytes',       bytes.length.toString(),
    'uploaded_at', new Date().toISOString(),
  );
  pipeline.expire(`${candidateKey}:meta`, CANDIDATE_TTL);
  await pipeline.exec();

  return json({ ok: true, stored: `${component}@${version}`, bytes: bytes.length }, { status: 201 });
};
