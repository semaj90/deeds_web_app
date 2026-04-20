/**
 * GET  /api/simulation/[sessionId]/keyframes — Fetch timeline keyframes for a session
 * POST /api/simulation/[sessionId]/keyframes — Generate or save keyframes
 *
 * Keyframes drive the 3D courtroom reconstruction timeline.
 * POST with action: 'generate' auto-creates keyframes from dialogue history.
 * POST with action: 'save' persists custom keyframes to the database.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import {
	courtroomKeyframes,
} from '$lib/server/db/schema-postgres.js';
import { eq, asc } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';
import { TimelineEngine } from '$lib/courtroom/timeline-engine.svelte.js';
import type { SimulationSession } from '../../+server.js';

const SESSION_PREFIX = 'sim:session:';

/** GET — Load keyframes for a session (DB first, then auto-generate from dialogue) */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) {
		return json({ keyframes: [] }, { status: 401 });
	}

	const { sessionId } = params;

	try {
		// Try DB keyframes first
		const dbKeyframes = await db
			.select()
			.from(courtroomKeyframes)
			.where(eq(courtroomKeyframes.sessionId, sessionId))
			.orderBy(asc(courtroomKeyframes.timeMs))
			.catch(() => []);

		if (dbKeyframes.length > 0) {
			return json({
				keyframes: dbKeyframes.map((kf) => ({
					id: kf.id,
					timeMs: kf.timeMs,
					characterRole: kf.characterRole,
					animType: kf.animType,
					animationId: kf.animationId,
					posX: kf.posX,
					posY: kf.posY,
					posZ: kf.posZ,
					rotY: kf.rotY,
					cameraView: kf.cameraView,
					dialogueTurn: kf.dialogueTurn,
					effect: kf.effect,
					evidenceUrl: kf.evidenceUrl,
					phase: kf.phase,
				})),
				source: 'database',
			});
		}

		// No DB keyframes — auto-generate from session dialogue
		const redis: Redis = getRedis();
		const raw = await redis.get(SESSION_PREFIX + sessionId);
		if (!raw) {
			return json({ keyframes: [], source: 'empty' });
		}

		const session = JSON.parse(raw) as SimulationSession;
		const autoKeyframes = TimelineEngine.generateFromDialogue(
			session.dialogueHistory,
			3000, // 3 seconds per dialogue turn
		);

		return json({
			keyframes: autoKeyframes,
			source: 'auto-generated',
			dialogueTurns: session.dialogueHistory.length,
		});
	} catch (err) {
		console.error('[keyframes] GET error:', err);
		return json({ keyframes: [], source: 'error' });
	}
};

const saveSchema = z.object({
	action: z.enum(['generate', 'save']),
	keyframes: z.array(z.object({
		timeMs: z.number().int().min(0),
		characterRole: z.string().min(1),
		animType: z.string().min(1),
		animationId: z.string().uuid().optional().nullable(),
		posX: z.number().optional().nullable(),
		posY: z.number().optional().nullable(),
		posZ: z.number().optional().nullable(),
		rotY: z.number().optional().nullable(),
		cameraView: z.string().optional().nullable(),
		dialogueTurn: z.number().int().optional().nullable(),
		effect: z.string().optional().nullable(),
		evidenceUrl: z.string().optional().nullable(),
		phase: z.string().optional().nullable(),
	})).optional(),
	msPerTurn: z.number().int().min(500).max(30000).optional(),
});

/** POST — Generate or save keyframes */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId } = params;
	const body = await request.json().catch(() => null);
	if (!body) return json({ success: false, error: 'Invalid JSON' }, { status: 400 });

	const parsed = saveSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 },
		);
	}

	const { action, keyframes: inputKeyframes, msPerTurn } = parsed.data;

	try {
		if (action === 'generate') {
			// Auto-generate from dialogue history
			const redis: Redis = getRedis();
			const raw = await redis.get(SESSION_PREFIX + sessionId);
			if (!raw) {
				return json({ success: false, error: 'Session not found' }, { status: 404 });
			}

			const session = JSON.parse(raw) as SimulationSession;
			const generated = TimelineEngine.generateFromDialogue(
				session.dialogueHistory,
				msPerTurn ?? 3000,
			);

			// Persist to database
			if (generated.length > 0) {
				// Clear existing auto-generated keyframes for this session
				await db.delete(courtroomKeyframes)
					.where(eq(courtroomKeyframes.sessionId, sessionId))
					.catch(() => {});

				// Insert new keyframes in batches of 50
				for (let i = 0; i < generated.length; i += 50) {
					const batch = generated.slice(i, i + 50).map((kf) => ({
						sessionId,
						timeMs: kf.timeMs,
						characterRole: kf.characterRole,
						animType: kf.animType as any,
						animationId: kf.animationId ?? null,
						posX: kf.posX ?? null,
						posY: kf.posY ?? null,
						posZ: kf.posZ ?? null,
						rotY: kf.rotY ?? null,
						cameraView: kf.cameraView ?? null,
						dialogueTurn: kf.dialogueTurn ?? null,
						effect: kf.effect ?? null,
						evidenceUrl: kf.evidenceUrl ?? null,
						phase: kf.phase ?? null,
					}));
					await db.insert(courtroomKeyframes).values(batch);
				}
			}

			return json({
				success: true,
				keyframes: generated,
				count: generated.length,
				source: 'generated',
			}, { status: 201 });
		}

		if (action === 'save' && inputKeyframes) {
			// Save custom keyframes
			await db.delete(courtroomKeyframes)
				.where(eq(courtroomKeyframes.sessionId, sessionId))
				.catch(() => {});

			for (let i = 0; i < inputKeyframes.length; i += 50) {
				const batch = inputKeyframes.slice(i, i + 50).map((kf) => ({
					sessionId,
					timeMs: kf.timeMs,
					characterRole: kf.characterRole,
					animType: kf.animType as any,
					animationId: kf.animationId ?? null,
					posX: kf.posX ?? null,
					posY: kf.posY ?? null,
					posZ: kf.posZ ?? null,
					rotY: kf.rotY ?? null,
					cameraView: kf.cameraView ?? null,
					dialogueTurn: kf.dialogueTurn ?? null,
					effect: kf.effect ?? null,
					evidenceUrl: kf.evidenceUrl ?? null,
					phase: kf.phase ?? null,
				}));
				await db.insert(courtroomKeyframes).values(batch);
			}

			return json({
				success: true,
				count: inputKeyframes.length,
				source: 'saved',
			}, { status: 201 });
		}

		return json({ success: false, error: 'Invalid action' }, { status: 400 });
	} catch (err) {
		console.error('[keyframes] POST error:', err);
		return json({ success: false, error: 'Failed to process keyframes' }, { status: 500 });
	}
};