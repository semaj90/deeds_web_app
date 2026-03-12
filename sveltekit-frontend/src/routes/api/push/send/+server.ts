import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendNotification, sendNtfy } from '$lib/server/notifications/push-service';
import type { NotificationPayload } from '$lib/server/notifications/push-service';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const pushSendSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500),
	body: z.string().min(1, 'Body is required').max(5000),
	icon: z.string().max(500).optional(),
	tag: z.string().max(200).optional(),
	url: z.string().max(2000).optional(),
	data: z.record(z.string(), z.unknown()).optional(),
	userId: z.string().uuid().optional(),
	channels: z.array(z.enum(['web-push', 'ntfy'])).optional(),
	ntfyTopic: z.string().max(200).optional()
});

/**
 * POST /api/push/send
 * Send a notification to a user or broadcast
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const raw = await request.json();
		const parsed = pushSendSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;

		const payload: NotificationPayload = {
			title: body.title,
			body: body.body,
			icon: body.icon ?? '/favicon.png',
			tag: body.tag,
			url: body.url,
			data: body.data,
		};

		const channels = body.channels ?? ['ntfy'];
		const results = [];

		// ntfy channel — always available, no subscription needed
		if (channels.includes('ntfy')) {
			const ntfyResult = await sendNtfy(payload, body.ntfyTopic);
			results.push(ntfyResult);
		}

		// Web Push — lookup stored subscriptions for the target user
		if (channels.includes('web-push')) {
			const targetUserId = body.userId ?? locals.user.id;
			try {
				const subs = await db.execute(sql`
					SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${targetUserId}
				`);

				for (const sub of subs.rows) {
					const subData = sub as { endpoint: string; p256dh: string; auth: string };
					const result = await sendNotification(payload, {
						channels: ['web-push'],
						webPushSubscription: {
							endpoint: subData.endpoint,
							keys: { p256dh: subData.p256dh, auth: subData.auth },
						},
					});
					results.push(...result);
				}
			} catch {
				results.push({ channel: 'web-push', success: false, error: 'Push subscriptions table not found' });
			}
		}

		return json({
			success: true,
			results,
			message: `Notification sent via ${results.filter(r => r.success).length}/${results.length} channels`,
		});
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		console.error('[Push] Send failed:', err);
		throw error(500, 'Failed to send notification');
	}
};