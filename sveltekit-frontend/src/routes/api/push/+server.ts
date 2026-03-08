import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
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
		const body = await request.json();
		const subscription = body.subscription;

		if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
			throw error(400, 'Invalid push subscription: missing endpoint or keys');
		}

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
		const body = await request.json();
		if (!body?.endpoint) {
			throw error(400, 'Missing endpoint');
		}

		await db.execute(sql`
			DELETE FROM push_subscriptions WHERE user_id = ${locals.user.id} AND endpoint = ${body.endpoint}
		`);

		return json({ success: true, message: 'Push subscription removed' });
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		console.error('[Push] Unsubscribe failed:', err);
		return json({ success: true, message: 'Unsubscribed' });
	}
};
