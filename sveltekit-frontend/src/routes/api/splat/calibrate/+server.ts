/**
 * POST /api/splat/calibrate
 * Solves and verifies a splat calibration from measured anchors. Stateless: no DB writes.
 * Returns a calibration receipt whose checksum binds the splat SHA-256 to the transform,
 * so the manifest can record both.
 */
import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import type { RequestHandler } from './$types';
import { calibrate, calibrationRequestSchema } from '$lib/splat/calibration.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	if (body === null) return json({ error: 'Invalid JSON' }, { status: 400 });

	const parsed = calibrationRequestSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const { splat, anchors, toleranceM } = parsed.data;

	let result: ReturnType<typeof calibrate>;
	try {
		result = calibrate(
			anchors.map((a) => ({ id: a.id, splat: a.splat, worldM: a.worldM })),
			toleranceM
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'CALIBRATION_FAILED';
		return json({ error: message }, { status: 422 });
	}

	const canonical = JSON.stringify({
		splatSha256: splat.sha256,
		transform: result.transform,
		toleranceM
	});
	const receiptSha256 = createHash('sha256').update(canonical).digest('hex');

	return json({
		status: result.pass ? 'PASS' : 'FAIL',
		splat: { format: splat.format, sha256: splat.sha256, uri: splat.uri ?? null },
		transform: result.transform,
		residualsM: result.residualsM,
		maxResidualM: result.maxResidualM,
		toleranceM,
		receiptSha256,
		canonicalAuthority: false
	});
};
