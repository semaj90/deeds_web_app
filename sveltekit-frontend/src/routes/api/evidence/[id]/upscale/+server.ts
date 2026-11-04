/**
 * POST /api/evidence/[id]/upscale
 * Read-only enlargement of an evidence image (Lanczos3 + light sharpen via sharp).
 * This is classical resampling, NOT AI super-resolution: it adds no real detail.
 * Nothing is written to storage or the database; the PNG is returned to the caller.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { getSeaweedFile as getFile } from '$lib/server/seaweed-client.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';
import { z } from 'zod';

const EVIDENCE_BUCKET = ENV.SEAWEED_EVIDENCE_BUCKET;
const MAX_SIDE = 8192;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

const bodySchema = z.object({ scale: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2) });

function extractObjectKey(fileUrl: string): { bucket: string; key: string } | null {
	if (!fileUrl) return null;
	if (fileUrl.startsWith('seaweed://') || fileUrl.startsWith('minio://')) {
		const rest = fileUrl.slice(fileUrl.indexOf('://') + 3);
		const i = rest.indexOf('/');
		return i === -1 ? null : { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
	}
	if (fileUrl.startsWith('http')) {
		try {
			const parts = new URL(fileUrl).pathname.split('/').filter(Boolean);
			if (parts.length >= 2) return { bucket: parts[0], key: parts.slice(1).join('/') };
		} catch {
			/* invalid URL */
		}
	}
	if (fileUrl.includes('/')) return { bucket: EVIDENCE_BUCKET, key: fileUrl };
	return null;
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

	let scale: 2 | 3 | 4 = 2;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Request body must be valid JSON' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) return json({ error: 'scale must be 2, 3 or 4' }, { status: 400 });
	scale = parsed.data.scale;

	const uid = Number(locals.user.id);
	const [item] = await db
		.select({ fileUrl: evidence.fileUrl, mimeType: evidence.mimeType, fileType: evidence.fileType })
		.from(evidence)
		.leftJoin(cases, eq(evidence.caseId, cases.id))
		.where(and(
			eq(evidence.id, params.id),
			or(
				eq(evidence.userId, uid),
				eq(evidence.uploadedBy, uid),
				and(
					isNotNull(evidence.caseId),
					or(eq(cases.userId, uid), eq(cases.assignedAttorney, uid)),
				),
			),
		))
		.limit(1);
	if (!item) return json({ error: 'Evidence not found' }, { status: 404 });

	const mime = item.mimeType ?? item.fileType ?? '';
	if (!/^image\//i.test(mime)) return json({ error: 'Evidence is not an image' }, { status: 415 });

	const loc = item.fileUrl ? extractObjectKey(item.fileUrl) : null;
	if (!loc) return json({ error: 'Cannot resolve file location' }, { status: 400 });

	try {
		const input = await getFile(loc.bucket, loc.key);
		if (input.length > MAX_INPUT_BYTES) return json({ error: 'Image too large' }, { status: 413 });

		const sharp = (await import('sharp')).default;
		const img = sharp(input, { failOn: 'none' }).rotate();
		const meta = await img.metadata();
		if (!meta.width || !meta.height) return json({ error: 'Unreadable image' }, { status: 422 });

		const factor = Math.min(scale, MAX_SIDE / Math.max(meta.width, meta.height));
		if (factor <= 1) return json({ error: `Image already at ${MAX_SIDE}px limit` }, { status: 422 });
		const width = Math.round(meta.width * factor);
		const height = Math.round(meta.height * factor);

		const out = await img
			.resize(width, height, { kernel: 'lanczos3' })
			.sharpen({ sigma: 0.8 })
			.png()
			.toBuffer();

		return new Response(new Uint8Array(out), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'private, no-store',
				'X-Upscale-Method': 'lanczos3',
				'X-Upscale-Size': `${width}x${height}`
			}
		});
	} catch (err) {
		console.error('[Upscale] failed:', err);
		return json({ error: 'Upscale failed' }, { status: 500 });
	}
};
