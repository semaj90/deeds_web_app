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

		// Handle updates — Phase D (2026-05-10): also broadcast `sw:update-available`
		// so consumers can subscribe via onServiceWorkerUpdate() and show an "update
		// ready" toast. Reloading is the caller's choice; we never reload automatically.
		registration.onupdatefound = () => {
			const installingWorker = registration.installing;
			if (installingWorker) {
				installingWorker.onstatechange = () => {
					if (installingWorker.state === 'installed') {
						if (navigator.serviceWorker.controller) {
							console.log('SW: New version available, reload recommended.');
							window.dispatchEvent(new CustomEvent('sw:update-available'));
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

/**
 * Subscribe to "new SW available" events broadcast by registerServiceWorker
 * when a new SW version installs alongside the active one. Returns an
 * unsubscribe function. Caller decides whether to reload — never automatic.
 *
 * @example
 *   const off = onServiceWorkerUpdate(() => toast('Reload to update?'));
 *   onDestroy(off);
 */
export function onServiceWorkerUpdate(cb: () => void): () => void {
	if (!browser) return () => undefined;
	const handler = () => cb();
	window.addEventListener('sw:update-available', handler);
	return () => window.removeEventListener('sw:update-available', handler);
}
