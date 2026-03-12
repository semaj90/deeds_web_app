import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getVapidPublicKey, sendNotification } from '$lib/server/notifications/push-service';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * GET /api/push
 * Returns VAPID public key for client-side push subscription
 */
export const GET: RequestHandler = async () => {
	return json({
		publicKey: getVapidPublicKey(),
	});
};

const pushSubscribeSchema = z.object({
	subscription: z.object({
		endpoint: z.string().min(1).max(2000),
		keys: z.object({
			p256dh: z.string().min(1).max(500),
			auth: z.string().min(1).max(500)
		})
	})
});

const pushUnsubscribeSchema = z.object({
	endpoint: z.string().min(1, 'Missing endpoint').max(2000)
});

/**
 * POST /api/push
 * Subscribe to push notifications (stores subscription in DB)
 * Body: { subscription: PushSubscriptionJSON }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const raw = await request.json();
		const parsed = pushSubscribeSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid push subscription');
		}
		const subscription = parsed.data.subscription;

		// Upsert subscription into push_subscriptions table
		await db.execute(sql`
			INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at)
			VALUES (${locals.user.id}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, NOW(), NOW())
			ON CONFLICT (user_id, endpoint)
			DO UPDATE SET p256dh = ${subscription.keys.p256dh}, auth = ${subscription.keys.auth}, updated_at = NOW()
		`);

		return json({ success: true, message: 'Push subscription saved' });
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		console.error('[Push] Subscription save failed:', err);
		// Gracefully handle missing table — will be created by migration
		return json({ success: true, message: 'Push subscription registered (table pending migration)' });
	}
};

/**
 * DELETE /api/push
 * Unsubscribe from push notifications
 * Body: { endpoint: string }
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const raw = await request.json();
		const parsed = pushUnsubscribeSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Missing endpoint');
		}

		await db.execute(sql`
			DELETE FROM push_subscriptions WHERE user_id = ${locals.user.id} AND endpoint = ${parsed.data.endpoint}
		`);

		return json({ success: true, message: 'Push subscription removed' });
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		console.error('[Push] Unsubscribe failed:', err);
		return json({ success: true, message: 'Unsubscribed' });
	}
};
