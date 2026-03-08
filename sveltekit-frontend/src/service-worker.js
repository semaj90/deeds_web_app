/// <reference lib="webworker" />

/**
 * Service Worker for Web Push Notifications
 * Handles push events from the server via VAPID/W3C Push API
 */

// Listen for push messages from the server
self.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		payload = {
			title: 'Deeds Legal AI',
			body: event.data.text(),
		};
	}

	const options = {
		body: payload.body ?? '',
		icon: payload.icon ?? '/favicon.png',
		badge: payload.badge ?? '/favicon.png',
		tag: payload.tag ?? 'deeds-notification',
		data: {
			url: payload.url ?? '/',
			...payload.data,
		},
		actions: payload.actions ?? [],
		requireInteraction: payload.requireInteraction ?? false,
	};

	event.waitUntil(
		self.registration.showNotification(payload.title ?? 'Deeds Legal AI', options)
	);
});

// Handle notification click — open the app or focus existing tab
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url ?? '/';

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// If a window is already open, focus it and navigate
			for (const client of clientList) {
				if ('focus' in client) {
					client.focus();
					client.navigate(url);
					return;
				}
			}
			// Otherwise open a new window
			return self.clients.openWindow(url);
		})
	);
});

// Handle subscription change (browser regenerates subscription)
self.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil(
		self.registration.pushManager.subscribe(event.oldSubscription?.options ?? {
			userVisibleOnly: true,
		}).then((subscription) => {
			// Re-register with server
			return fetch('/api/push', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subscription: subscription.toJSON() }),
			});
		})
	);
});
