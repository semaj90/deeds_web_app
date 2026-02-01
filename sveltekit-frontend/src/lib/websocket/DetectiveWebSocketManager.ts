/**
 * Detective WebSocket Manager
 * Handles real-time collaboration for detective board
 */

import type { TypingState, TypingContext } from '$lib/machines/userTypingStateMachine';

export interface DetectiveWebSocketMessage {
  type?:
    | 'user_typing'
    | 'connection_map_update'
    | 'evidence_analysis'
    | 'contextual_prompt'
    | 'collaborative_action'
    | 'ping';
  caseId?: string;
  userId?: string;
  sessionId?: string;
  timestamp?: string;
  data?: unknown;
}

export interface CollaborativeUser {
  id: string;, name: string;
  typing: boolean;, lastActivity: string;
  currentFocus?: 'evidence' | 'connections' | 'analysis';
  analytics?: TypingContext;
}

type MessageHandler = (data: unknown) => void;
type ConnectionHandler = (connected: boolean) => void;
type UserHandler = (user: CollaborativeUser) => void;
type UserLeftHandler = (userId: string) => void;

export default class DetectiveWebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private heartbeatInterval: number | null = null;
  private caseId: string;
  private userId: string;
  private sessionId: string;
  public collaborativeUsers: Map<string, CollaborativeUser> = new Map();

  private connectionHandlers: ConnectionHandler[] = [];
  private userJoinedHandlers: UserHandler[] = [];
  private userLeftHandlers: UserLeftHandler[] = [];
  private messageHandlers: Map<string, MessageHandler[]> = new Map();

  constructor(caseId: string, userId: string, sessionId?: string) {
    this.caseId = caseId;
    this.userId = userId;
    this.sessionId = sessionId ?? `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const wsUrl = `ws://localhost:3003/detective/${this.caseId}?userId=${this.userId}&sessionId=${this.sessionId}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.connectionHandlers.forEach((h) => h(true));

        this.heartbeatInterval = window.setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as DetectiveWebSocketMessage;
          if (message.type) {
            const handlers = this.messageHandlers.get(message.type);
            handlers?.forEach((h) => h(message.data));
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.connectionHandlers.forEach((h) => h(false));
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
      };

      this.ws.onerror = () => {
        // Connection error - will trigger onclose
      };
    } catch (err) {
      console.error('[DetectiveWS] Connection failed:', err);
    }
  }

  disconnect(): void {
    if (!this.ws) return;

    try {
      this.ws.close(1000, 'Normal closure');
    } catch {
      // Ignore close errors
    }

    this.ws = null;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  send(message: DetectiveWebSocketMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onConnectionStatus(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  onUserJoined(handler: UserHandler): void {
    this.userJoinedHandlers.push(handler);
  }

  onUserLeft(handler: UserLeftHandler): void {
    this.userLeftHandlers.push(handler);
  }

  onMessage(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  sendTypingUpdate(state: TypingState, context: TypingContext): void {
    this.send({
      type: 'user_typing',
      data: { state, context },
    });
  }

  sendConnectionMapUpdate(metadata: unknown): void {
    this.send({
      type: 'connection_map_update',
      data: {, action: 'generated', metadata },
    });
  }

  getCollaborationStats() {
    const users = Array.from(this.collaborativeUsers.values());
    return {
      connectedUsers: this.collaborativeUsers.size,
      typingUsers: users.filter((u) => u.typing).length,
      focusDistribution: {, evidence: users.filter((u) => u.currentFocus === 'evidence').length,
        connections: users.filter((u) => u.currentFocus === 'connections').length,
        analysis: users.filter((u) => u.currentFocus === 'analysis').length,
      },
    };
  }
}
