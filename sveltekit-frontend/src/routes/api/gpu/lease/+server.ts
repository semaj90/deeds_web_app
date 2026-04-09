/**
 * GET /api/gpu/lease — Get current GPU VRAM lease status
 * POST /api/gpu/lease — Acquire GPU lease for a backend
 * DELETE /api/gpu/lease — Release GPU lease
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import {
	acquireGpuLease,
	releaseGpuLease,
	getGpuLeaseStatus,
} from '$lib/server/inference/gpu-arbiter.js';
import { z } from 'zod';

const gpuLeaseSchema = z.object({
	backend: z.enum(['ollama', 'tensorrt']),
	ttlSeconds: z.number().int().min(1).max(3600).optional().default(120)
});

const gpuReleaseSchema = z.object({
	backend: z.enum(['ollama', 'tensorrt'])
});

export async function GET({ locals }: RequestEvent) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lease = await getGpuLeaseStatus();
    return json({
      lease,
      free: !lease,
      remainingMs: lease ? Math.max(0, lease.expiresAt - Date.now()) : null,
    });
  } catch (err) {
    console.error('GPU lease status error:', err);
    return json({ lease: null, free: true, remainingMs: null });
  }
}

export async function POST({ request, locals }: RequestEvent) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json();
	const parsed = gpuLeaseSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { backend, ttlSeconds } = parsed.data;

	try {
		const lease = await acquireGpuLease(backend, ttlSeconds);
		if (!lease) {
			const current = await getGpuLeaseStatus();
			return json({
				error: 'GPU is held by another backend',
				currentLease: current
			}, { status: 409 });
		}

		return json({ lease, acquired: true });
	} catch (err) {
		console.error('GPU lease acquire error:', err);
		return json({ error: 'Failed to acquire GPU lease' }, { status: 500 });
	}
}

export async function DELETE({ request, locals }: RequestEvent) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json();
	const parsed = gpuReleaseSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { backend } = parsed.data;

	try {
		const released = await releaseGpuLease(backend);
		return json({ released, backend });
	} catch (err) {
		console.error('GPU lease release error:', err);
		return json({ error: 'Failed to release GPU lease' }, { status: 500 });
	}
}