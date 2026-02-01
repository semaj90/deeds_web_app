// src/lib/server/wsBroker.ts
import WebSocket from 'ws';
import type { ProgressMsg } from '$lib/types/progress';
import type { Redis as IORedisRedis } from 'ioredis';

// Use the exported Redis type so .on / .status are recognized by TS
type RedisClient = IORedisRedis;

// In-memory session registry
const sessions = new Map<string, Set<WebSocket>>();

// Redis client for pub/sub across instances
let redis: RedisClient | null = null;
let subscriber: RedisClient | null = null;

// Factory function type
type CreateRedisInstance = (options?: { lazyConnect?: boolean }) => RedisClient;

export async function initializeWsBroker(): Promise<void> {
    try {
        // Try to dynamically import Redis factory
        let createRedisInstance: CreateRedisInstance | null = null;

        try {
            const redisModule = await import('$lib/server/redis');
            createRedisInstance = redisModule.createRedisInstance;
        } catch (e) {
            console.warn('⚠️ Redis module not available, running wsBroker in local-only mode');
        }

        if (createRedisInstance) {
            try {
                // Publisher: singleton instance
                redis = createRedisInstance({ lazyConnect: true });
                // Subscriber: dedicated fresh connection for pub/sub
                subscriber = createRedisInstance({ lazyConnect: true });
            } catch (e) {
                console.warn('⚠️ createRedisInstance failed, running wsBroker in local-only mode:', e);
                redis = null;
                subscriber = null;
            }
        }

        // Subscribe to progress messages channel
        if (subscriber) {
            try {
                await subscriber.subscribe('evidence:progress');
            } catch (err: unknown) {
                console.warn('⚠️ Redis subscribe failed, running in local-only mode');
            }

            // Listen for messages
            subscriber.on('message', (channel: string, message: string) => {
                if (channel === 'evidence:progress') {
                    try {
                        const data = JSON.parse(message) as Record<string, unknown> | null;
                        if (!data) return;

                        const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
                        const { sessionId: _sid, ...payload } = data as Record<string, unknown>;

                        if (sessionId) {
                            sendWsMessageToSessionLocal(sessionId, payload as ProgressMsg);
                        }
                    } catch (err: unknown) {
                        console.error('❌ Error parsing Redis pub/sub message:', err);
                    }
                }
            });

            subscriber.on('error', (err: any) => {
                console.error('❌ Redis subscriber error:', err);
            });
        }

        if (redis) {
            redis.on('error', (err: any) => {
                console.error('❌ Redis error:', err);
            });
        }

        console.log('✅ WebSocket broker initialized with Redis pub/sub');
    } catch (error: Error | unknown) {
        console.error('❌ Failed to initialize broker:', error);
        // Continue without Redis - local only mode
    }
}

// Register a WebSocket connection for a session
export function registerWsConnection(sessionId: string, ws: WebSocket): void {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new Set<WebSocket>());
    }
    sessions.get(sessionId)!.add(ws);
    console.log(`🔗 WebSocket connected session: ${sessionId} (${sessions.get(sessionId)!.size} total)`);

    // Setup cleanup on close
    ws.on('close', () => {
        const sessionSet = sessions.get(sessionId);
        if (!sessionSet) return;

        sessionSet.delete(ws);
        if (sessionSet.size === 0) {
            sessions.delete(sessionId);
            console.log(`🔗 Session ${sessionId} cleaned up - no active connections`);
        } else {
            console.log(`📌 WebSocket disconnected session: ${sessionId} (${sessionSet.size} remaining)`);
        }
    });

    ws.on('error', (error) => {
        console.error(`❌ WebSocket error for session ${sessionId}:`, error);
    });

    // Send initial connection confirmation
    try {
        ws.send(JSON.stringify({
            type: 'connection-established',
            sessionId,
            timestamp: new Date().toISOString()
        }));
    } catch (err: unknown) {
        console.error('❌ Error sending confirmation:', err);
    }
}

// Send message to local WebSocket connections only
function sendWsMessageToSessionLocal(sessionId: string, msg: ProgressMsg): void {
    const sessionSet = sessions.get(sessionId);
    if (!sessionSet || sessionSet.size === 0) {
        console.debug(`📭 No local WebSocket connections session: ${sessionId}`);
        return;
    }

    const messageStr = JSON.stringify({
        ...msg,
        timestamp: new Date().toISOString(),
        sessionId
    });

    // Send to all connections for this session
    for (const ws of Array.from(sessionSet)) {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            } else {
                sessionSet.delete(ws); // Clean up dead connections
            }
        } catch (err: unknown) {
            console.error(`❌ Error sending WebSocket message to session ${sessionId}:`, err);
            sessionSet.delete(ws); // Remove failed connection
        }
    }

    console.log(`📤 Sent message to ${sessionSet.size} WebSocket connections session: ${sessionId}`);
}

// Send message to session (with Redis pub/sub for horizontal scaling)
export function sendWsMessageToSession(sessionId: string, msg: ProgressMsg): void {
    // Send to local connections immediately
    sendWsMessageToSessionLocal(sessionId, msg);

    // Publish to Redis for other instances
    if (redis && (redis as any).status === 'ready') {
        try {
            redis.publish('evidence:progress', JSON.stringify({ sessionId, ...msg }));
        } catch (err: unknown) {
            console.error('❌ Error publishing to Redis:', err);
        }

        // Store message in Redis for offline clients (with TTL)
        (async () => {
            try {
                const key = `session:${sessionId}:messages`;
                const messageData = JSON.stringify({
                    ...msg,
                    timestamp: new Date().toISOString()
                });

                // Sequential commands
                await redis!.lpush(key, messageData);
                await redis!.ltrim(key, 0, 49);
                await redis!.expire(key, 3600);
            } catch (err: unknown) {
                console.error('❌ Error storing message in Redis:', err);
            }
        })();
    }
}

// Get missed messages for a session (when client reconnects)
export async function getMissedMessages(sessionId: string, since?: string): Promise<ProgressMsg[]> {
    if (!redis || (redis as any).status !== 'ready') {
        return [];
    }

    try {
        const key = `session:${sessionId}:messages`;
        const messages: string[] = await redis.lrange(key, 0, -1);

        const parsed = messages
            .map((msg: string) => {
                try {
                    return JSON.parse(msg);
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .filter((m: any) => {
                if (!since) return true;
                if (m && typeof m === 'object' && 'timestamp' in m) {
                    const rawTs = (m as Record<string, unknown>)['timestamp'];
                    const tsStr = typeof rawTs === 'string'
                        ? rawTs
                        : rawTs instanceof Date
                            ? rawTs.toISOString()
                            : String(rawTs ?? '');
                    return !!tsStr && new Date(tsStr) > new Date(since);
                }
                return false;
            })
            .reverse(); // Return in chronological order (oldest first)

        return parsed as ProgressMsg[];
    } catch (err: unknown) {
        console.error('❌ Error getting messages:', err);
        return [];
    }
}

// Get session connection count
export function getSessionConnectionCount(sessionId: string): number {
    return sessions.get(sessionId)?.size ?? 0;
}

// Get all active sessions
export function getActiveSessions(): string[] {
    return Array.from(sessions.keys());
}

// Broadcast to all sessions (admin functionality)
export function broadcastToAllSessions(msg: ProgressMsg): void {
    for (const sessionId of sessions.keys()) {
        sendWsMessageToSession(sessionId, msg);
    }
}

// Health check
export function wsHealthCheck(): {
	local: number; redis: boolean } {
    const localConnections = Array.from(sessions.values()).reduce(
        (total, set) => total + set.size,
        0
    );

    return {
        local: localConnections,
        redis: redis !== null && (redis as any).status === 'ready'
    };
}

// Graceful shutdown
export async function closeWsBroker(): Promise<void> {
    try {
        // Close all WebSocket connections
        for (const sessionSet of sessions.values()) {
            for (const ws of sessionSet) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close(1001, 'Server shutting down');
                }
            }
        }
        sessions.clear();

        // Close Redis connections
        if (subscriber) {
            try {
                await subscriber.quit();
            } catch (err: unknown) {
                console.warn('⚠️ Error closing subscriber:', err);
            }
            subscriber = null;
        }

        if (redis) {
            try {
                await redis.quit();
            } catch (err: unknown) {
                console.warn('⚠️ Error closing redis:', err);
            }
            redis = null;
        }

        console.log('✅ WebSocket broker closed gracefully');
    } catch (err: unknown) {
        console.error('❗ Error closing broker:', err);
    }
}

