/**
 * Simple telemetry event bus for performance monitoring
 */

type TelemetryEventHandler = (data: any) => void;

class TelemetryBus {
  private listeners: Map<string, Set<TelemetryEventHandler>> = new Map();
  private eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];
  private maxHistorySize = 100;

  /**
   * Emit a telemetry event
   */
  emit(event: string, data: any): void {
    // Store in history
    this.eventHistory.push(<any>(<any>{ event, data, timestamp: Date.now() }));
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Telemetry handler error for event ${event}:`, error);
        }
      });
    }

    // Also emit to wildcard listeners
    const wildcardHandlers = this.listeners.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler({ event, data });
        } catch (error) {
          console.error(`Telemetry wildcard handler error:`, error);
        }
      });
    }

    // Log to console in dev mode
    if (import.meta.env.DEV) {
      console.debug(`[Telemetry] ${event}`, data);
    }
  }

  /**
   * Subscribe to telemetry events
   */
  on(event: string, handler: TelemetryEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Get recent event history
   */
  getHistory(eventFilter?: string): Array<{ event: string; data: any; timestamp: number }> {
    if (eventFilter) {
      return this.eventHistory.filter((item) => item.event === eventFilter);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get all active event types
   */
  getActiveEvents(): string[] {
    return Array.from(this.listeners.keys());
  }
}

// Export singleton instance
export const telemetryBus = new TelemetryBus();

// Auto-attach to window for debugging
if (typeof window !== 'undefined') {
  (window as any).__TELEMETRY_BUS__ = telemetryBus;
}
