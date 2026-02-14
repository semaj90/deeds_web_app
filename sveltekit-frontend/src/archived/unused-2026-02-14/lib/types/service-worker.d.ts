// Service Worker types for proper event handling
declare global {
	// Service Worker Global Scope
	interface ServiceWorkerGlobalScope extends WorkerGlobalScope {
		addEventListener(type: 'install', listener: (event: ExtendableEvent) => void): void;
		addEventListener(type: 'activate', listener: (event: ExtendableEvent) => void): void;
		addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
		addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void;
		addEventListener(type: 'sync', listener: (event: SyncEvent) => void): void;
		addEventListener(type: 'push', listener: (event: PushEvent) => void): void;
		addEventListener(type: 'notificationclick', listener: (event: NotificationEvent) => void): void;
	}

	// Service Worker Events
	interface ExtendableEvent extends Event {
		waitUntil(promise: Promise<unknown>): void;
	}

	interface FetchEvent extends ExtendableEvent {
		request: Request;
		respondWith(response: Promise<Response> | Response): void;
	}

	interface ExtendableMessageEvent extends ExtendableEvent {
		data: Record<string, unknown>;
		origin: string;
		lastEventId: string;
		source: Client | ServiceWorker | MessagePort | null;
		ports: MessagePort[];
	}

	interface SyncEvent extends ExtendableEvent {
		tag: string;
		lastChance: boolean;
	}

	interface PushEvent extends ExtendableEvent {
		data: PushMessageData | null;
	}

	interface NotificationEvent extends ExtendableEvent {
		notification: Notification;
		action: string;
	}

	// Service Worker Registration
	interface ServiceWorkerRegistration {
		sync: SyncManager;
	}

	interface SyncManager {
		register(tag: string): Promise<void>;
		getTags(): Promise<string[]>;
	}

	// Global self reference for service worker
	const self: ServiceWorkerGlobalScope;
}

export {};