/**
 * sw-register.ts
 *
 * Client-side Service Worker registration and communication bridge.
 * Surfaced to the app via `src/routes/+layout.svelte`.
 */

import { browser } from '$app/environment';

export async function registerServiceWorker() {
	if (!browser || !('serviceWorker' in navigator)) return;

	try {
		const registration = await navigator.serviceWorker.register('/sw.js', {
			scope: '/'
		});
		console.log('SW: Registered with scope:', registration.scope);

		// Handle updates
		registration.onupdatefound = () => {
			const installingWorker = registration.installing;
			if (installingWorker) {
				installingWorker.onstatechange = () => {
					if (installingWorker.state === 'installed') {
						if (navigator.serviceWorker.controller) {
							console.log('SW: New version available, reload recommended.');
						} else {
							console.log('SW: Content cached for offline use.');
						}
					}
				};
			}
		};
	} catch (error) {
		console.error('SW: Registration failed:', error);
	}
}

/**
 * Log a telemetry event to the Service Worker for background sync.
 */
export function logTelemetry(type: string, payload: any = {}) {
	if (!browser || !navigator.serviceWorker?.controller) {
		// Fallback to direct fetch if SW not active
		fetch('/api/admin/telemetry', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type, ...payload, timestamp: Date.now() })
		}).catch(() => {});
		return;
	}

	navigator.serviceWorker.controller.postMessage({
		type: 'log-telemetry',
		event: {
			type,
			...payload,
			timestamp: Date.now()
		}
	});
}
