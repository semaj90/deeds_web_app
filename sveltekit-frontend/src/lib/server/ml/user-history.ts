/**
 * User Interaction History Tracking
 * Records clicks, views, saves, and other interactions for recommendation training
 *
 * Interaction types:
 *   - 'view': Document opened in detail panel (durationSeconds tracked)
 *   - 'click': User clicked a recommendation link
 *   - 'save': User saved the document to a case
 *   - 'share': User shared the document (email, export)
 *   - 'dismiss': User dismissed the recommendation
 *
 * Topic preferences are inferred from interaction context and stored as:
 *   [{ topicId: number, affinity: number }, ...]
 *
 * Usage:
 *   const tracker = new UserHistoryTracker(userId);
 *   await tracker.recordView(documentId, caseId, 45, 'my search query');
 *   await tracker.recordClick(recommendationId, documentId, caseId);
 *   const prefs = await tracker.getUserTopicPreferences();
 */

import { db } from '$lib/server/db/client';
import { userInteractionHistory } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export interface InteractionRecord {
	id: string;
	userId: string;
	recommendationId?: string;
	documentId?: string;
	caseId?: string;
	interactionType: 'view' | 'click' | 'save' | 'share' | 'dismiss';
	durationSeconds?: number;
	searchContext?: string;
	topicPreferences: Array<{ topicId: number; affinity: number }>;
	metadata: Record<string, any>;
	createdAt: string;
}

export interface UserTopicPreference {
	topicId: number;
	affinity: number; // Sum of weighted interactions in this topic
	confidence: number; // How certain we are about this preference [0, 1]
	lastInteractionMs: number; // Timestamp of most recent interaction
}

export class UserHistoryTracker {
	private userId: string;

	constructor(userId: string) {
		this.userId = userId;
	}

	/**
	 * Record a document view interaction
	 */
	async recordView(
		documentId: string,
		caseId: string,
		durationSeconds: number,
		searchContext?: string,
		inferredTopics?: Array<{ topicId: number; affinity: number }>
	): Promise<void> {
		try {
			await db.insert(userInteractionHistory).values({
				id: uuidv4(),
				userId: this.userId,
				documentId,
				caseId,
				interactionType: 'view',
				durationSeconds,
				searchContext,
				topicPreferences: inferredTopics || [],
				metadata: {
					source: 'document_detail_panel',
					viewTimeMs: durationSeconds * 1000
				}
			});
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to record view:', err);
		}
	}

	/**
	 * Record a recommendation click
	 */
	async recordClick(
		recommendationId: string,
		documentId: string,
		caseId?: string,
		inferredTopics?: Array<{ topicId: number; affinity: number }>
	): Promise<void> {
		try {
			await db.insert(userInteractionHistory).values({
				id: uuidv4(),
				userId: this.userId,
				recommendationId,
				documentId,
				caseId,
				interactionType: 'click',
				topicPreferences: inferredTopics || [],
				metadata: {
					source: 'recommendation_panel',
					clickTimestamp: new Date().toISOString()
				}
			});
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to record click:', err);
		}
	}

	/**
	 * Record a save interaction
	 */
	async recordSave(
		documentId: string,
		caseId: string,
		inferredTopics?: Array<{ topicId: number; affinity: number }>
	): Promise<void> {
		try {
			await db.insert(userInteractionHistory).values({
				id: uuidv4(),
				userId: this.userId,
				documentId,
				caseId,
				interactionType: 'save',
				topicPreferences: inferredTopics || [],
				metadata: {
					source: 'document_save_action',
					savedTimestamp: new Date().toISOString()
				}
			});
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to record save:', err);
		}
	}

	/**
	 * Record a share interaction (email, export, etc)
	 */
	async recordShare(
		documentId: string,
		shareMethod: 'email' | 'export' | 'link',
		caseId?: string,
		inferredTopics?: Array<{ topicId: number; affinity: number }>
	): Promise<void> {
		try {
			await db.insert(userInteractionHistory).values({
				id: uuidv4(),
				userId: this.userId,
				documentId,
				caseId,
				interactionType: 'share',
				topicPreferences: inferredTopics || [],
				metadata: {
					source: 'document_share_action',
					shareMethod,
					sharedTimestamp: new Date().toISOString()
				}
			});
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to record share:', err);
		}
	}

	/**
	 * Record a dismiss interaction
	 */
	async recordDismiss(
		recommendationId: string,
		documentId: string,
		reason?: string
	): Promise<void> {
		try {
			await db.insert(userInteractionHistory).values({
				id: uuidv4(),
				userId: this.userId,
				recommendationId,
				documentId,
				interactionType: 'dismiss',
				topicPreferences: [],
				metadata: {
					source: 'recommendation_dismiss',
					dismissReason: reason,
					dismissedTimestamp: new Date().toISOString()
				}
			});
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to record dismiss:', err);
		}
	}

	/**
	 * Get user's topic preferences from interaction history
	 * Applies 7-day exponential decay window
	 * Returns topics sorted by affinity descending
	 */
	async getUserTopicPreferences(): Promise<UserTopicPreference[]> {
		try {
			const interactions = await db
				.select({
					topicPreferences: userInteractionHistory.topicPreferences,
					createdAt: userInteractionHistory.createdAt
				})
				.from(userInteractionHistory)
				.where(eq(userInteractionHistory.userId, this.userId))
				.limit(500);

			const topicMap = new Map<number, { affinity: number; lastMs: number; count: number }>();
			const now = Date.now();
			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

			for (const interaction of interactions) {
				const ageMs = now - new Date(interaction.createdAt).getTime();
				if (ageMs > sevenDaysMs) continue; // Outside decay window

				// Exponential decay weight
				const weight = Math.exp(-ageMs / sevenDaysMs);

				const topics = interaction.topicPreferences as Array<{ topicId: number; affinity: number }>;
				for (const topic of topics) {
					const current = topicMap.get(topic.topicId) ?? {
						affinity: 0,
						lastMs: ageMs,
						count: 0
					};
					current.affinity += weight * topic.affinity;
					current.lastMs = Math.min(current.lastMs, ageMs);
					current.count++;
					topicMap.set(topic.topicId, current);
				}
			}

			// Convert map to sorted array with confidence scoring
			const preferences = Array.from(topicMap.entries()).map(([topicId, data]) => {
				// Confidence based on interaction count (higher count = higher confidence)
				const confidence = Math.min(1, data.count / 10); // Saturate at 10 interactions

				return {
					topicId,
					affinity: Math.min(1, data.affinity), // Clamp to [0, 1]
					confidence,
					lastInteractionMs: data.lastMs
				};
			});

			// Sort by affinity descending
			preferences.sort((a, b) => b.affinity - a.affinity);

			return preferences;
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to get user topic preferences:', err);
			return [];
		}
	}

	/**
	 * Get user's recent interactions
	 */
	async getRecentInteractions(limit = 50): Promise<InteractionRecord[]> {
		try {
			const interactions = await db
				.select()
				.from(userInteractionHistory)
				.where(eq(userInteractionHistory.userId, this.userId))
				.limit(limit);

			return interactions.map((i) => ({
				id: i.id,
				userId: i.userId,
				recommendationId: i.recommendationId || undefined,
				documentId: i.documentId || undefined,
				caseId: i.caseId || undefined,
				interactionType: i.interactionType as any,
				durationSeconds: i.durationSeconds || undefined,
				searchContext: i.searchContext || undefined,
				topicPreferences: i.topicPreferences as any,
				metadata: i.metadata as any,
				createdAt: i.createdAt
			}));
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to get recent interactions:', err);
			return [];
		}
	}

	/**
	 * Get interaction statistics for dashboard
	 */
	async getInteractionStats(): Promise<{
		totalInteractions: number;
		byType: Record<string, number>;
		topDocuments: Array<{ documentId: string; count: number }>;
		topCases: Array<{ caseId: string; count: number }>;
	}> {
		try {
			const interactions = await db
				.select()
				.from(userInteractionHistory)
				.where(eq(userInteractionHistory.userId, this.userId));

			const byType: Record<string, number> = {
				view: 0,
				click: 0,
				save: 0,
				share: 0,
				dismiss: 0
			};

			const docMap = new Map<string, number>();
			const caseMap = new Map<string, number>();

			for (const i of interactions) {
				byType[i.interactionType]++;

				if (i.documentId) {
					docMap.set(i.documentId, (docMap.get(i.documentId) ?? 0) + 1);
				}
				if (i.caseId) {
					caseMap.set(i.caseId, (caseMap.get(i.caseId) ?? 0) + 1);
				}
			}

			const topDocuments = Array.from(docMap.entries())
				.map(([documentId, count]) => ({ documentId, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			const topCases = Array.from(caseMap.entries())
				.map(([caseId, count]) => ({ caseId, count }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			return {
				totalInteractions: interactions.length,
				byType,
				topDocuments,
				topCases
			};
		} catch (err) {
			console.error('[UserHistoryTracker] Failed to get interaction stats:', err);
			return {
				totalInteractions: 0,
				byType: { view: 0, click: 0, save: 0, share: 0, dismiss: 0 },
				topDocuments: [],
				topCases: []
			};
		}
	}
}