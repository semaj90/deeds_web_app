import { browser } from '$app/environment';

/**
 * Client-side Web Push subscription manager
 * Handles service worker registration, permission request, and subscription
 */

/** Check if push notifications are supported */
export function isPushSupported(): boolean {
	if (!browser) return false;
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Get current notification permission */
export function getPermissionState(): NotificationPermission | 'unsupported' {
	if (!browser || !('Notification' in window)) return 'unsupported';
	return Notification.permission;
}

/** Request notification permission and subscribe to push */
export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) {
		return { success: false, error: 'Push notifications not supported in this browser' };
	}

	try {
		// Request permission
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			return { success: false, error: `Permission ${permission}` };
		}

		// Get VAPID public key from server
		const keyResponse = await fetch('/api/push');
		const { publicKey } = await keyResponse.json();

		// Register service worker if not already registered
		const registration = await navigator.serviceWorker.ready;

		// Subscribe to push
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
		});

		// Send subscription to server
		const saveResponse = await fetch('/api/push', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription: subscription.toJSON() }),
		});

		const result = await saveResponse.json();
		return { success: result.success };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[Push] Subscribe failed:', message);
		return { success: false, error: message };
	}
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
	if (!isPushSupported()) return { success: false, error: 'Not supported' };

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			const endpoint = subscription.endpoint;
			await subscription.unsubscribe();

			// Remove from server
			await fetch('/api/push', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint }),
			});
		}

		return { success: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return { success: false, error: message };
	}
}

/** Check if user is currently subscribed */
export async function isSubscribed(): Promise<boolean> {
	if (!isPushSupported()) return false;
	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		return subscription !== null;
	} catch {
		return false;
	}
}

/** Convert URL-safe base64 VAPID key to Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
