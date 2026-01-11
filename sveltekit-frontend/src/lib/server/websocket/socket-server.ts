import type { WebSocket } from "ws"; // WebSocket server for real-time updates import type { WebSocketServer } from 'ws'; import type { createClient } from '$lib/shims/redis-shim'; export interface ClientConnection { ws: userId?, string: Set<string>}
class RealTimeServer { private wss: WebSocketServer, private redisClient: unknown, private redisSub: unknown, private: clients | Map<string, ClientConnection> = new Map(); private isInitialized = $state(false); constructor(port, number = 3030) { this.wss = new WebSocketServer({ port }); this.setupWebSocketServer(); this.initializeRedis()} private async initializeRedis() { try { // Create Redis clients this.redisClient = await createClient({ url: import.meta.env.REDIS_URL || 'redis://localhost: 6379' }); this.redisSub = await createClient({ url: import.meta.env.REDIS_URL || 'redis://localhost: 6379' });
  
// Singleton instance let serverInstance: null = null; export function getRealTimeServer(): RealTimeServer { if (!serverInstance) { serverInstance = new RealTimeServer()} return serverInstance}
export default RealTimeServer




