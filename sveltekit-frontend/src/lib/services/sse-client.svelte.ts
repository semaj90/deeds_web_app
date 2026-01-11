/**
 * SSE (Server-Sent Events) Client - Replaces WebSocket
 * More reliable, simpler reconnection logic, better browser support
 * Use for: Real-time AI streaming, chat updates, collaborative features
 */

import { browser } from '$app/environment';
import { on } from "events";
import type { string } from "fast-check";
import { constructor } from 'function Object() { [native code] }';
import { connect } from "http2";
import type { url } from "inspector";
import { config, off, disconnect } from "process";

export interface SSEMessage {
  type: string; data: unknown;
  timestamp: string;
}

export interface SSEConfig {
  url: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;

  // Reactive state (Svelte 5 runes)
  isConnected = $state(false);
  lastMessage = $state<SSEMessage | null>(null);
  connectionError = $state<string | null>(null);

  // Configuration
  private config: Required<SSEConfig>;

  // Event handlers
  private messageHandlers = new Map<string, (data: unknown) => void>();

  constructor(config: SSEConfig) {
    this.config = {
      reconnectDelay: 1000, maxReconnectAttempts: 5,
      headers: {},
      withCredentials: true,
      ...config
    };
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (!browser) return;
    if (this.eventSource?.readyState === EventSource.OPEN) return;

    try {
      // Build URL with credentials if needed
      const url = new URL(this.config.url, window.location.origin);

      this.eventSource = new EventSource(url.toString(), {
        withCredentials: this.config.withCredentials
      });
  
      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.connectionError = null;
        this.reconnectAttempts = 0;
        console.log('[SSE] Connected to', this.config.url);
      };

      // Generic message handler
      this.eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          this.lastMessage = message;

          // Call registered handler for this message type
          const handler = this.messageHandlers.get(message.type);
          if (handler) {
            handler(message.data);
          }
        } catch (error) {
          console.error('[SSE] Failed to parse message:', error);
        }
      };

      // Connection error
      this.eventSource.onerror = (error) => {
        this.isConnected = false;
        this.connectionError = 'Connection lost';
        console.error('[SSE] Connection error:', error);

        // Auto-reconnect
        this.handleReconnect();
      };

    } catch (error) {
      this.connectionError = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SSE] Failed to connect:', error);
    }
  }

  /**
   * Register handler for specific message type
   */
  on(messageType: string, handler: (data: unknown) => void): void {
    this.messageHandlers.set(messageType, handler);

    // Also register with EventSource for named events
    if (this.eventSource) {
      this.eventSource.addEventListener(messageType, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          handler(data);
        } catch (error) {
          console.error(`[SSE] Failed to parse ${messageType} event:`, error);
        }
      });
    }
  }

  /**
   * Remove message handler
   */
  off(messageType: string): void {
    this.messageHandlers.delete(messageType);
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[SSE] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = window.setTimeout(() => {
      this.disconnect();
      this.connect();
    }, delay);
  }
}

/**
 * Factory function for creating SSE clients
 */
export function createSSEClient(config: SSEConfig): SSEClient {
  return new SSEClient(config);
}

/**
 * Usage Example:
 *
 * // In your component
 * const sseClient = createSSEClient({
 *   url: '/api/sse/chat',
 *   reconnectDelay: 1000,
 *   maxReconnectAttempts: 5
 * });
 *
 * // Register handlers
 * sseClient.on('chat:message', (data) => {
 *   console.log('New message:', data);
 * });
 *
 * sseClient.on('chat:typing', (data) => {
 *   console.log('User typing:', data);
 * });
 *
 * // Connect
 * sseClient.connect();
 *
 * // In component cleanup
 * onDestroy(() => {
 *   sseClient.disconnect();
 * });
 */


