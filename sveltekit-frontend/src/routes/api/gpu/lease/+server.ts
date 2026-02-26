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
	type InferenceBackend
} from '$lib/server/inference/gpu-arbiter.js';

export async function GET() {
	const lease = await getGpuLeaseStatus();
	return json({
		lease,
		free: !lease,
		remainingMs: lease ? Math.max(0, lease.expiresAt - Date.now()) : null
	});
}

export async function POST({ request }: RequestEvent) {
	const body = await request.json();
	const { backend, ttlSeconds = 120 } = body as {
		backend: InferenceBackend;
		ttlSeconds?: number;
	};

	if (!backend || !['ollama', 'tensorrt'].includes(backend)) {
		return json({ error: 'backend must be "ollama" or "tensorrt"' }, { status: 400 });
	}

	const lease = await acquireGpuLease(backend, ttlSeconds);
	if (!lease) {
		const current = await getGpuLeaseStatus();
		return json({
			error: 'GPU is held by another backend',
			currentLease: current
		}, { status: 409 });
	}

	return json({ lease, acquired: true });
}

export async function DELETE({ request }: RequestEvent) {
	const body = await request.json();
	const { backend } = body as { backend: InferenceBackend };

	if (!backend) {
		return json({ error: 'backend is required' }, { status: 400 });
	}

	const released = await releaseGpuLease(backend);
	return json({ released, backend });
}
