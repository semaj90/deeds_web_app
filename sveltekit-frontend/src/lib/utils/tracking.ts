/**
 * Interaction tracking utilities
 * Non-blocking helpers for recording user interactions
 */

export type InteractionType = 'view' | 'click' | 'save' | 'share' | 'dismiss';
export type ShareMethod = 'email' | 'export' | 'link';

interface TrackViewOptions {
	documentId: string;
	caseId?: string;
	durationSeconds?: number;
	searchContext?: string;
}

interface TrackClickOptions {
	documentId: string;
	recommendationId: string;
	caseId?: string;
	searchContext?: string;
}

interface TrackSaveOptions {
	documentId: string;
	caseId: string;
}

interface TrackShareOptions {
	documentId: string;
	shareMethod: ShareMethod;
	caseId?: string;
}

interface TrackDismissOptions {
	recommendationId: string;
	documentId: string;
	dismissReason?: string;
}

/**
 * Track a document view interaction
 * Non-blocking - errors are logged but don't affect UX
 */
export async function trackView(options: TrackViewOptions): Promise<void> {
	try {
		await fetch('/api/recommendations/track', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				interactionType: 'view',
				documentId: options.documentId,
				caseId: options.caseId,
				durationSeconds: options.durationSeconds || 0,
				searchContext: options.searchContext
			})
		});
	} catch (err) {
		console.warn('[tracking] View tracking failed:', err);
	}
}

/**
 * Track a recommendation click
 */
export async function trackClick(options: TrackClickOptions): Promise<void> {
	try {
		await fetch('/api/recommendations/track', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				interactionType: 'click',
				documentId: options.documentId,
				recommendationId: options.recommendationId,
				caseId: options.caseId,
				searchContext: options.searchContext
			})
		});
	} catch (err) {
		console.warn('[tracking] Click tracking failed:', err);
	}
}

/**
 * Track a document save
 */
export async function trackSave(options: TrackSaveOptions): Promise<void> {
	try {
		await fetch('/api/recommendations/track', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				interactionType: 'save',
				documentId: options.documentId,
				caseId: options.caseId
			})
		});
	} catch (err) {
		console.warn('[tracking] Save tracking failed:', err);
	}
}

/**
 * Track a document share
 */
export async function trackShare(options: TrackShareOptions): Promise<void> {
	try {
		await fetch('/api/recommendations/track', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				interactionType: 'share',
				documentId: options.documentId,
				shareMethod: options.shareMethod,
				caseId: options.caseId
			})
		});
	} catch (err) {
		console.warn('[tracking] Share tracking failed:', err);
	}
}

/**
 * Track a recommendation dismissal
 */
export async function trackDismiss(options: TrackDismissOptions): Promise<void> {
	try {
		await fetch('/api/recommendations/track', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				interactionType: 'dismiss',
				recommendationId: options.recommendationId,
				documentId: options.documentId,
				dismissReason: options.dismissReason
			})
		});
	} catch (err) {
		console.warn('[tracking] Dismiss tracking failed:', err);
	}
}

/**
 * Track view with auto-duration calculation
 * Usage: const tracker = createViewTracker(documentId); ... tracker.complete()
 */
export function createViewTracker(documentId: string, caseId?: string, searchContext?: string) {
	const startTime = Date.now();

	return {
		complete: async () => {
			const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
			await trackView({ documentId, caseId, durationSeconds, searchContext });
		}
	};
}
