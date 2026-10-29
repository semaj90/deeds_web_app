/**
 * GET  /api/courtroom/models — List available 3D character models + animations
 * POST /api/courtroom/models — Register a new model or animation
 *
 * Returns model definitions the client can use with CourtroomScene.loadModels().
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	courtroomModels,
	courtroomAnimations,
} from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { filterToMoveSet } from '$lib/courtroom/courtroom-move-set-v1.js';
import { resolveCourtroomFallbackModelUrl, resolveCourtroomModelUrl } from '$lib/courtroom/model-assets-v1.js';

// Prefer the packaged N64 export; the selector falls back to skinned and original assets if an export is absent.
const assetExists = (url: string) => existsSync(join(process.cwd(), 'static', url));
const FALLBACK_COURTROOM_MODEL_URL = resolveCourtroomFallbackModelUrl(assetExists);
/**
 * A registered model whose file is missing under static/ (10 of the 11 `courtroom_models` rows point at
 * `*_default.glb` files that do not exist, verified 2026-10-28) would 404 in the scene and leave a procedural
 * figure. Serve the fallback character for those rows instead; the database rows are not modified.
 */
function existingModelUrl(url: string | null | undefined): string {
	return resolveCourtroomModelUrl(url, assetExists) || FALLBACK_COURTROOM_MODEL_URL;
}

const FALLBACK_COURTROOM_ANIMATIONS = [
	{
		name: 'Cross-Stage Speaking',
		animType: 'speaking',
		animationUrl: '/models/courtroom/speaking_crossstage.glb',
		durationMs: 8000,
		loop: false,
	},
	{
		name: 'Dramatic Objection',
		animType: 'objection',
		animationUrl: '/models/courtroom/objection_dramatic.glb',
		durationMs: 3000,
		loop: false,
	},
	{
		name: 'Point at Audience',
		animType: 'point',
		animationUrl: '/models/courtroom/point_audience.glb',
		durationMs: 6000,
		loop: false,
	},
	{
		name: 'Teaching Gesture',
		animType: 'gesture',
		animationUrl: '/models/courtroom/gesture_teaching.glb',
		durationMs: 5000,
		loop: false,
	},
	{
		name: 'Normal Walk Cycle',
		animType: 'walk',
		animationUrl: '/models/courtroom/walk_normal.glb',
		durationMs: 1800,
		loop: true,
	},
] as const;

/**
 * Only the move set (courtroom-move-set-v1) is served per model: the DB lists ~49 clips (627 MB) and loading all of them
 * for every character is what made the scene take ~90 s. A move-set type the DB does not cover falls back to the bundled clip.
 */
function withMoveSetFallbacks<T extends { animType: string }>(clips: T[]): Array<T | (typeof FALLBACK_COURTROOM_ANIMATIONS)[number]> {
	const have = new Set(clips.map((c) => c.animType));
	return [...clips, ...FALLBACK_COURTROOM_ANIMATIONS.filter((f) => !have.has(f.animType))];
}

const FALLBACK_COURTROOM_MODELS = [
	{
		id: 'fallback-prosecutor',
		name: 'Courtroom Prosecutor',
		role: 'prosecutor',
		modelUrl: FALLBACK_COURTROOM_MODEL_URL,
		thumbnailUrl: null,
		skeletonType: 'mixamo',
		scale: { x: 1, y: 1, z: 1 },
		animations: [...FALLBACK_COURTROOM_ANIMATIONS],
	},
	{
		id: 'fallback-defense',
		name: 'Courtroom Defense',
		role: 'defense',
		modelUrl: FALLBACK_COURTROOM_MODEL_URL,
		thumbnailUrl: null,
		skeletonType: 'mixamo',
		scale: { x: 1, y: 1, z: 1 },
		animations: [...FALLBACK_COURTROOM_ANIMATIONS],
	},
	{
		id: 'fallback-judge',
		name: 'Courtroom Judge',
		role: 'judge',
		modelUrl: FALLBACK_COURTROOM_MODEL_URL,
		thumbnailUrl: null,
		skeletonType: 'mixamo',
		scale: { x: 1, y: 1, z: 1 },
		animations: [...FALLBACK_COURTROOM_ANIMATIONS],
	},
	{
		id: 'fallback-witness',
		name: 'Courtroom Witness',
		role: 'witness',
		modelUrl: FALLBACK_COURTROOM_MODEL_URL,
		thumbnailUrl: null,
		skeletonType: 'mixamo',
		scale: { x: 1, y: 1, z: 1 },
		animations: [...FALLBACK_COURTROOM_ANIMATIONS],
	},
] as const;

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

		if (models.length === 0) {
			return json({
				models: FALLBACK_COURTROOM_MODELS,
				animations: FALLBACK_COURTROOM_ANIMATIONS.map((a, idx) => ({
					id: `fallback-animation-${idx}`,
					name: a.name,
					animType: a.animType,
					animationUrl: a.animationUrl,
					durationMs: a.durationMs,
					loop: a.loop,
					skeletonType: 'mixamo',
				})),
			});
		}

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
				modelUrl: existingModelUrl(m.modelUrl),
				thumbnailUrl: m.thumbnailUrl,
				skeletonType: m.skeletonType,
				scale: { x: m.scaleX, y: m.scaleY, z: m.scaleZ },
				animations: withMoveSetFallbacks(
					filterToMoveSet(
						(animsByType.get(m.skeletonType) ?? [])
							.filter((a) => a.animationUrl) // skip procedural placeholders (empty URL)
							.map((a) => ({ id: a.id, name: a.name, animType: a.animType, animationUrl: a.animationUrl, durationMs: a.durationMs, loop: a.loop })),
					),
				),
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
