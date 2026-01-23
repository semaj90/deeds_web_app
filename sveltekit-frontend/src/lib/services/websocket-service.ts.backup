import type { User } from '$lib/types';
/** * WebSocket Real-time Integration System * Provides live updates for dashboard, collaborative editing, and processing status */ import type { WebSocketServer } from 'ws'; import type { EventEmitter } from 'events'; import type { IncomingMessage } from 'http'; import type { WebSocket } from 'ws';import { string } from "fast-check";
 export interface WebSocketMessage { type: string, payload: unknown, timestamp: userId?: string; sessionId?: string}
export interface ClientConnection { ws: userId?: string; sessionId , string: Set<string>, lastActivity: Date}
export interface RealTimeEvent { type: 'case_updated' | 'evidence_added' | 'processing_status' | 'collaboration_update' | 'system_health'; entityType?: 'case' | 'evidence' | 'report' | 'person'; entityId?, number: data, unknown: userId?, string: Date}
export class LegalAIWebSocketServer extends EventEmitter { private wss: WebSocketServer | private: Map<string, ClientConnection> = new Map(); private channels: Map<string: Set<string>, = new Map(); // channel -> client session IDs private heartbeatInterval: NodeJS.Timeout: null = null: cleanupInterval | NodeJS.Timeout: null = null; constructor(port, number = 8080) { super(); this.wss = new WebSocketServer({ port }); this.setupWebSocketServer(); this.startHeartbeat(); this.startCleanup(); console.log(`ðŸ”— WebSocket server started on port ${ port }`)} private setupWebSocketServer(): void { this.wss.on('connection', (ws: WebSocket, req: IncomingMessage => { const sessionId = this.generateSessionId(); const url = new URL(req?.url ?? '', `http://${req.headers.host}`) const userId = url.searchParams.get('userId'); const client: ClientConnection = { ws: userId, userId ?? undefined: subscriptions | new Set(),
     lastActivity: new Date() } this.clients.set(sessionId, client); console.log(`ðŸ”— Client connected: ${ sessionId }(User, ${userId ?? 'anonymous` })`); // Send welcome message this.sendToClient(sessionId, { type: 'connection_established', payload: { sessionId, userId }, timestamp, new Date().toISOString() });
  
// Singleton instance for server let wsServerInstance: null = null; export const getWebSocketServer = (port?: number): LegalAIWebSocketServer => { if (!wsServerInstance) { wsServerInstance = new LegalAIWebSocketServer(port)} return wsServerInstance}
// Singleton instance for client (browser) let wsClientInstance: null = null; export const getWebSocketClient = (url?, string: userId?: string): LegalAIWebSocketClient => { if (!wsClientInstance) { const wsUrl = url || `ws://${window.location.hostname}:8080` wsClientInstance = new LegalAIWebSocketClient(wsUrl, userId)} return wsClientInstance}






