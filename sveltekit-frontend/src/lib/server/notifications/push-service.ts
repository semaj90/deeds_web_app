import { ENV } from '$lib/server/env.server';

/**
 * Multi-channel notification service
 * Channels: Web Push (VAPID), ntfy.sh, in-app (DB)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface PushSubscriptionData {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
}

export interface NotificationPayload {
	title: string;
	body: string;
	icon?: string;
	badge?: string;
	tag?: string;
	url?: string;
	data?: Record<string, unknown>;
}

export type NotificationChannel = 'web-push' | 'ntfy' | 'email' | 'in-app';

export interface NotificationResult {
	channel: NotificationChannel;
	success: boolean;
	error?: string;
}

// ── Web Push (VAPID / W3C Push API) ────────────────────────────────

let webPushModule: typeof import('web-push') | null = null;

async function getWebPush() {
	if (!webPushModule) {
		webPushModule = await import('web-push');
		webPushModule.setVapidDetails(
			ENV.VAPID_CONTACT,
			ENV.VAPID_PUBLIC_KEY,
			ENV.VAPID_PRIVATE_KEY
		);
	}
	return webPushModule;
}

export async function sendWebPush(
	subscription: PushSubscriptionData,
	payload: NotificationPayload
): Promise<NotificationResult> {
	try {
		const wp = await getWebPush();
		await wp.sendNotification(
			subscription as any,
			JSON.stringify(payload),
			{ TTL: 86400 } // 24 hour TTL
		);
		return { channel: 'web-push', success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.warn('[Push] Web Push failed:', message);
		return { channel: 'web-push', success: false, error: message };
	}
}

// ── ntfy.sh (free push notification service) ──────────────────────

export async function sendNtfy(
	payload: NotificationPayload,
	topic?: string
): Promise<NotificationResult> {
	try {
		const ntfyTopic = topic ?? ENV.NTFY_TOPIC;
		const ntfyUrl = ENV.NTFY_URL;

		const response = await fetch(`${ntfyUrl}/${ntfyTopic}`, {
			method: 'POST',
			headers: {
				'Title': payload.title,
				'Priority': '4',
				'Tags': payload.tag ?? 'scales',
				...(payload.url ? { 'Click': payload.url } : {}),
			},
			body: payload.body,
		});

		if (!response.ok) {
			throw new Error(`ntfy returned ${response.status}`);
		}

		return { channel: 'ntfy', success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.warn('[Push] ntfy.sh failed:', message);
		return { channel: 'ntfy', success: false, error: message };
	}
}

// ── Email (Nodemailer) ────────────────────────────────────────────

let transporter: any = null;

async function getTransporter() {
	if (!transporter && ENV.SMTP_USER) {
		const nodemailer = await import('nodemailer');
		transporter = nodemailer.createTransport({
			host: ENV.SMTP_HOST,
			port: ENV.SMTP_PORT,
			secure: ENV.SMTP_PORT === 465,
			auth: {
				user: ENV.SMTP_USER,
				pass: ENV.SMTP_PASS,
			},
		});
	}
	return transporter;
}

export async function sendEmail(
	to: string,
	payload: NotificationPayload
): Promise<NotificationResult> {
	try {
		const transport = await getTransporter();
		if (!transport) {
			return { channel: 'email', success: false, error: 'SMTP not configured (set SMTP_USER/SMTP_PASS)' };
		}

		await transport.sendMail({
			from: ENV.SMTP_FROM,
			to,
			subject: payload.title,
			text: payload.body,
			html: `
				<div style="font-family: 'JetBrains Mono', monospace; max-width: 600px; margin: 0 auto; padding: 24px; background: #f5f0e6; border: 2px solid #1a1a1a; border-radius: 8px;">
					<h2 style="margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">${payload.title}</h2>
					<p style="margin: 0 0 16px; line-height: 1.6;">${payload.body}</p>
					${payload.url ? `<a href="${payload.url}" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #f5f0e6; text-decoration: none; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">View in App</a>` : ''}
					<hr style="margin: 20px 0; border: 1px solid #ccc;" />
					<p style="font-size: 0.75rem; color: #666;">Deeds Legal AI Platform</p>
				</div>
			`,
		});

		return { channel: 'email', success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.warn('[Push] Email failed:', message);
		return { channel: 'email', success: false, error: message };
	}
}

// ── Multi-channel dispatch ────────────────────────────────────────

export async function sendNotification(
	payload: NotificationPayload,
	options: {
		channels?: NotificationChannel[];
		webPushSubscription?: PushSubscriptionData;
		ntfyTopic?: string;
		userId?: string;
		email?: string;
	} = {}
): Promise<NotificationResult[]> {
	const channels = options.channels ?? ['ntfy'];
	const results: NotificationResult[] = [];

	for (const channel of channels) {
		switch (channel) {
			case 'web-push':
				if (options.webPushSubscription) {
					results.push(await sendWebPush(options.webPushSubscription, payload));
				} else {
					results.push({ channel: 'web-push', success: false, error: 'No subscription provided' });
				}
				break;

			case 'ntfy':
				results.push(await sendNtfy(payload, options.ntfyTopic));
				break;

			case 'email':
				if (options.email) {
					results.push(await sendEmail(options.email, payload));
				} else {
					results.push({ channel: 'email', success: false, error: 'No email address provided' });
				}
				break;

			case 'in-app':
				// In-app notifications are handled client-side via notificationStore
				results.push({ channel: 'in-app', success: true });
				break;
		}
	}

	return results;
}

// ── VAPID public key getter (for client-side subscription) ────────

export function getVapidPublicKey(): string {
	return ENV.VAPID_PUBLIC_KEY;
}
