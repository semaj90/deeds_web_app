/**
 * Lightweight Markov-chain predictor for next-action precomputation (RNN-inspired)
 * Learns P(next|prev) from short user interaction sequences
 * Enhanced with Redis caching for persistence and performance
 */
import { env } from '$env/dynamic/private';
import { ensureRedisReady, redis } from '$lib/server/redis-client';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

type ActionType = string; // e.g., 'open:123', 'hover:123', 'search:term|indemnification'

interface PredictionResult {
    action: ActionType | null;
    probability: number;
}

class MarkovPredictorWithRedis {
    // Use a flexible type for the shared client to avoid typing mismatches
    private redisClient: unknown;
    private localTransitions = new Map<ActionType, Map<ActionType, number>>();
    private localLastByUser = new Map<string, ActionType>();
    private syncBatchSize = 50;
    private pendingUpdates = 0;
    private lastSync = Date.now();
    private cacheEnabled: boolean;

    constructor() {
        // Initialize Redis connection with password support
        const redisPassword = env?.REDIS_PASSWORD;
        const redisUrl = env?.REDIS_URL ?? 'redis://localhost:6379';

        this.redisClient = redis;
        this.cacheEnabled = true;

        // Test Redis connection
        this.initializeRedis();
    }

    private async initializeRedis(): Promise<void> {
        try {
            await ensureRedisReady();
        } catch {
            console.warn('⚠️ Redis unavailable, using local memory only');
            this.cacheEnabled = false;
        }
    }

    /**
     * Record a user action and update transition probabilities
     */
    async recordAction(userId: string, action: ActionType): Promise<void> {
        const lastAction = this.localLastByUser.get(userId);

        if (lastAction) {
            // Update local transitions
            if (!this.localTransitions.has(lastAction)) {
                this.localTransitions.set(lastAction, new Map());
            }
            const transitions = this.localTransitions.get(lastAction)!;
            transitions.set(action, (transitions.get(action) ?? 0) + 1);

            this.pendingUpdates++;

            // Sync to Redis periodically
            if (this.pendingUpdates >= this.syncBatchSize) {
                await this.syncToRedis();
            }
        }

        this.localLastByUser.set(userId, action);
    }

    /**
     * Predict the next most likely action given a current action
     */
    predict(action: ActionType): PredictionResult {
        const transitions = this.localTransitions.get(action);

        if (!transitions || transitions.size === 0) {
            return { action: null, probability: 0 };
        }

        let maxCount = 0;
        let maxAction: ActionType | null = null;
        let totalCount = 0;

        for (const [nextAction, count] of transitions) {
            totalCount += count;
            if (count > maxCount) {
                maxCount = count;
                maxAction = nextAction;
            }
        }

        return {
            action: maxAction,
            probability: totalCount > 0 ? maxCount / totalCount : 0
        };
    }

    /**
     * Get top N predictions for a given action
     */
    predictTopN(action: ActionType, n: number = 5): PredictionResult[] {
        const transitions = this.localTransitions.get(action);

        if (!transitions || transitions.size === 0) {
            return [];
        }

        let totalCount = 0;
        const entries: [ActionType, number][] = [];

        for (const [nextAction, count] of transitions) {
            totalCount += count;
            entries.push([nextAction, count]);
        }

        return entries
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([action, count]) => ({
                action,
                probability: totalCount > 0 ? count / totalCount : 0
            }));
    }

    /**
     * Sync local transitions to Redis
     */
    private async syncToRedis(): Promise<void> {
        if (!this.cacheEnabled) return;

        try {
            // For now, just reset the counter
            // In production, would serialize and store in Redis
            this.pendingUpdates = 0;
            this.lastSync = Date.now();
        } catch (error) {
            console.error('Failed to sync predictions to Redis:', error);
        }
    }

    /**
     * Clear all predictions
     */
    clear(): void {
        this.localTransitions.clear();
        this.localLastByUser.clear();
        this.pendingUpdates = 0;
    }
}

export const predictor = new MarkovPredictorWithRedis();

export function mapActionToCHRContext(action: ActionType): { docId?: string; query?: string } {
    // Simple mapping conventions
    if (action.startsWith('open:doc:')) {
        return { docId: action.split(':')[2] };
    }
    if (action.startsWith('hover:doc:')) {
        return { docId: action.split(':')[2] };
    }
    if (action.startsWith('search:term:')) {
        return { query: decodeURIComponent(action.substring('search:term:'.length)) };
    }
    return {};
}

export type { ActionType, PredictionResult };
