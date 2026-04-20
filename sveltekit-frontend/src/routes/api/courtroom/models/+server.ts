/**
 * GET  /api/courtroom/models — List available 3D character models + animations
 * POST /api/courtroom/models — Register a new model or animation
 *
 * Returns model definitions the client can use with CourtroomScene.loadModels().
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	courtroomModels,
	courtroomAnimations,
} from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

/** GET — List all available models + their animations */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return json({ models: [], animations: [] });
	}

	try {
		const [models, animations] = await Promise.all([
			db.select().from(courtroomModels).catch(() => []),
			db.select().from(courtroomAnimations).catch(() => []),
		]);

		// Group animations by skeleton type for easy client-side matching
		const animsByType = new Map<string, typeof animations>();
		for (const anim of animations) {
			const key = anim.skeletonType;
			if (!animsByType.has(key)) animsByType.set(key, []);
			animsByType.get(key)!.push(anim);
		}

		return json({
			models: models.map((m) => ({
				id: m.id,
				name: m.name,
				role: m.role,
				modelUrl: m.modelUrl,
				thumbnailUrl: m.thumbnailUrl,
				skeletonType: m.skeletonType,
				scale: { x: m.scaleX, y: m.scaleY, z: m.scaleZ },
				animations: (animsByType.get(m.skeletonType) ?? []).map((a) => ({
					id: a.id,
					name: a.name,
					animType: a.animType,
					animationUrl: a.animationUrl,
					durationMs: a.durationMs,
					loop: a.loop,
				})),
			})),
			animations: animations.map((a) => ({
				id: a.id,
				name: a.name,
				animType: a.animType,
				animationUrl: a.animationUrl,
				durationMs: a.durationMs,
				loop: a.loop,
				skeletonType: a.skeletonType,
			})),
		});
	} catch (err) {
		console.error('[courtroom/models] GET error:', err);
		return json({ models: [], animations: [] });
	}
};

const modelSchema = z.object({
	type: z.enum(['model', 'animation']),
	// Model fields
	name: z.string().min(1).max(100),
	role: z.string().min(1).max(50).optional(),
	modelUrl: z.string().min(1).max(500).optional(),
	thumbnailUrl: z.string().max(500).optional().nullable(),
	skeletonType: z.string().max(50).optional().default('mixamo'),
	scaleX: z.number().optional().default(1),
	scaleY: z.number().optional().default(1),
	scaleZ: z.number().optional().default(1),
	// Animation fields
	animType: z.string().optional(),
	animationUrl: z.string().max(500).optional(),
	durationMs: z.number().int().optional(),
	loop: z.boolean().optional().default(false),
	blendWeight: z.number().optional().default(1),
});

/** POST — Register a new model or animation */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	if (!body) return json({ success: false, error: 'Invalid JSON' }, { status: 400 });

	const parsed = modelSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 },
		);
	}

	try {
		if (parsed.data.type === 'model') {
			if (!parsed.data.role || !parsed.data.modelUrl) {
				return json({ success: false, error: 'Model requires role and modelUrl' }, { status: 400 });
			}

			const [inserted] = await db.insert(courtroomModels).values({
				name: parsed.data.name,
				role: parsed.data.role,
				modelUrl: parsed.data.modelUrl,
				thumbnailUrl: parsed.data.thumbnailUrl ?? null,
				skeletonType: parsed.data.skeletonType ?? 'mixamo',
				scaleX: parsed.data.scaleX ?? 1,
				scaleY: parsed.data.scaleY ?? 1,
				scaleZ: parsed.data.scaleZ ?? 1,
			}).returning();

			return json({ success: true, model: inserted }, { status: 201 });
		}

		if (parsed.data.type === 'animation') {
			if (!parsed.data.animType || !parsed.data.animationUrl || !parsed.data.durationMs) {
				return json({ success: false, error: 'Animation requires animType, animationUrl, and durationMs' }, { status: 400 });
			}

			const [inserted] = await db.insert(courtroomAnimations).values({
				name: parsed.data.name,
				animType: parsed.data.animType as any,
				animationUrl: parsed.data.animationUrl,
				durationMs: parsed.data.durationMs,
				loop: parsed.data.loop ?? false,
				blendWeight: parsed.data.blendWeight ?? 1,
				skeletonType: parsed.data.skeletonType ?? 'mixamo',
			}).returning();

			return json({ success: true, animation: inserted }, { status: 201 });
		}

		return json({ success: false, error: 'Invalid type' }, { status: 400 });
	} catch (err) {
		console.error('[courtroom/models] POST error:', err);
		return json({ success: false, error: 'Failed to register' }, { status: 500 });
	}
};