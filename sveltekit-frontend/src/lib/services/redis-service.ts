import type { User } from '$lib/types';
import type { Case } from '$lib/types';
import { redis, ensureRedisReady } from '$lib/server/redis-client';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface RedisConfig {
    url: string;
	retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
}

class RedisService {
    private client: unknown = null;
    private publisher: any = null;
    private subscriber: any = null;
    private isConnected = false;
    private realTimeServer: unknown = null;

    constructor() {
        this.initializeClients();
    }

    private async initializeClients() {
        const config: RedisConfig = {
            url: import.meta.env?.REDIS_URL ?? 'redis://localhost:4005',
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        };

        try {
            // Main client for operations
            this.client = await redis;
            this.publisher = await redis;
            this.subscriber = await redis;

            // Setup error handlers
            if (this.client && typeof (this.client as any).on === 'function') {
                (this.client as any).on('error', this.handleError.bind(this));
            }
            if (this.publisher && typeof (this.publisher as any).on === 'function') {
                (this.publisher as any).on('error', this.handleError.bind(this));
            }
            if (this.subscriber && typeof (this.subscriber as any).on === 'function') {
                (this.subscriber as any).on('error', this.handleError.bind(this));
            }

            // Connect all clients
            await Promise.all([
                (this.client as any)?.connect?.(),
                (this.publisher as any)?.connect?.(),
                (this.subscriber as any)?.connect?.()
            ]);

            this.isConnected = true;
            console.log('✅ Redis clients connected successfully');
        } catch (error: Error | unknown) {
            console.error('❌ Redis connection failed:', error);
            this.isConnected = false;
        }
    }

    private handleError(error: Error) {
        console.error('Redis error:', error);
        this.isConnected = false;
    }

    // Evidence Updates
    public async publishEvidenceCreated(evidenceId: string, evidenceData: unknown, userId?: string) {
        await this.publish('evidence_update', {
            type: 'EVIDENCE_CREATED',
            evidenceId,
            data: evidenceData,
            timestamp: new Date().toISOString()
        });
    }

    public async publishEvidenceUpdated(evidenceId: string, changes: unknown, userId?: string) {
        await this.publish('evidence_update', {
            type: 'EVIDENCE_UPDATED',
            evidenceId,
            changes,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    public async publishEvidenceDeleted(evidenceId: string, userId?: string) {
        await this.publish('evidence_update', {
            type: 'EVIDENCE_DELETED',
            evidenceId,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // Case Updates
    public async publishCaseUpdated(caseId: string, changes: unknown, userId?: string) {
        await this.publish('case_update', {
            type: 'CASE_UPDATED',
            caseId,
            changes,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    public async publishCaseStatusChanged(caseId: string, oldStatus: string, newStatus: string, userId?: string) {
        await this.publish('case_update', {
            type: 'CASE_STATUS_CHANGED',
            caseId,
            oldStatus,
            newStatus,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // Canvas Updates
    public async publishCanvasNodeMoved(caseId: string, nodeId: string, position: {
	x: number, y: number },
	userId?: string) {
        await this.publish('canvas_update', {
            type: 'CANVAS_NODE_MOVED',
            caseId,
            nodeId,
            position,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    public async publishCanvasNodeAdded(caseId: string, nodeData: unknown, userId?: string) {
        await this.publish('canvas_update', {
            type: 'CANVAS_NODE_ADDED',
            caseId,
            nodeData,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    public async publishCanvasStateChanged(caseId: string, state: unknown, userId?: string) {
        await this.publish('canvas_update', {
            type: 'CANVAS_STATE_CHANGED',
            caseId,
            state,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // POI Updates
    public async publishPOIUpdated(poiId: string, changes: unknown, userId?: string) {
        await this.publish('poi_update', {
            type: 'POI_UPDATED',
            poiId,
            changes,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // Report Updates
    public async publishReportUpdated(reportId: string, changes: unknown, userId?: string) {
        await this.publish('report_update', {
            type: 'REPORT_UPDATED',
            reportId,
            changes,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // User Activity
    public async publishUserActivity(userId: string, activity: string, metadata?: unknown) {
        await this.publish('user_activity', {
            type: 'USER_ACTIVITY',
            userId,
            activity,
            metadata,
            timestamp: new Date().toISOString()
        });
    }

    // Generic publish method
    private async publish(channel: string, data: unknown) {
        if (!this.isConnected) {
            console.warn('Redis not connected, skipping publish');
            return;
        }

        try {
            const message = JSON.stringify(data);
            await (this.publisher as any).publish(channel, message);
        } catch (error: Error | unknown) {
            console.error(`Failed to publish to ${channel}:`, error);
        }
    }

    // Cache operations
    public async setCache(key: string, value: unknown, ttlSeconds: number = 300) {
        if (!this.isConnected) return;

        try {
            const serialized = JSON.stringify(value);
            await (this.client as any).setEx(key, ttlSeconds, serialized);
        } catch (error: Error | unknown) {
            console.error('Cache set error:', error);
        }
    }

    public async getCache(key: string) {
        if (!this.isConnected) return null;

        try {
            const cached = await (this.client as any).get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (error: Error | unknown) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    public async deleteCache(key: string) {
        if (!this.isConnected) return;

        try {
            await (this.client as any).del(key);
        } catch (error: Error | unknown) {
            console.error('Cache delete error:', error);
        }
    }

    // Bulk operations
    public async publishBulkEvidenceUpdate(evidenceIds: string[], action: string, userId?: string) {
        await this.publish('evidence_update', {
            type: 'EVIDENCE_BULK_UPDATE',
            evidenceIds,
            action,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    // Analytics and metrics
    public async trackEvent(event: string, data: unknown, userId?: string) {
        await this.publish('analytics', {
            event,
            data,
            userId,
            timestamp: new Date().toISOString()
        });
    }

    public isConnectedToRedis(): boolean {
        return this.isConnected;
    }

    public async disconnect() {
        try {
            if (this.client && typeof (this.client as any).disconnect === 'function') {
                await (this.client as any).disconnect();
            }
        } catch (e) {
            // ignore
        }

        try {
            if (this.publisher && typeof (this.publisher as any).disconnect === 'function') {
                await (this.publisher as any).disconnect();
            }
        } catch (e) {
            // ignore
        }

        try {
            if (this.subscriber && typeof (this.subscriber as any).disconnect === 'function') {
                await (this.subscriber as any).disconnect();
            }
        } catch (e) {
            // ignore
        }

        this.isConnected = false;
    }
}

// Singleton instance
let redisServiceInstance: RedisService | null = null;

export function getRedisService(): RedisService {
    if (!redisServiceInstance) {
        redisServiceInstance = new RedisService();
    }
    return redisServiceInstance;
}

export default RedisService;
