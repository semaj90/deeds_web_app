/**
 * Production-Grade Telemetry Event Bus
 * Lightweight, high-performance event collection and analytics
 */

// Type declarations
declare global {
  interface Window {
    __TELEMETRY__?: unknown;
    __GPU_MANAGER__?: {
      getAcceleration(): unknown;
    };
  }
}

export namespace Telemetry {
  export interface BaseEvent {
    timestamp: number;
	sessionId: string;
    userId?: string;
  }

  export interface GPUEvent extends BaseEvent {
    type: 'gpu_usage' | 'context_switch' | 'memory_allocation';
    gpuUtilization: number;
	memoryUsed: number;
    temperature?: number;
  }

  export interface PerformanceEvent extends BaseEvent {
    type: 'render_time' | 'api_latency' | 'cache_hit' | 'vector_encoding';
    duration: number;
	operation: string;
    success: boolean;
  }

  export interface ErrorEvent extends BaseEvent {
    type: 'error' | 'warning' | 'critical';
    message: string;
    stack?: string;
    component?: string;
  }
}

export interface MemoryBank {
  id: number;
	size: number;
  used: number;
	available: number;
  type: 'L1_GPU' | 'L2_RAM' | 'L3_REDIS' | 'CHR_ROM' | 'PRG_ROM';
}

export type TelemetryEvent = Telemetry.GPUEvent | Telemetry.PerformanceEvent | Telemetry.ErrorEvent;

interface TelemetryOptions {
  maxBufferSize: number;
	flushInterval: number;
  enableDebug: boolean;
  endpoint?: string;
}

interface TelemetryMetrics {
  eventsCollected: number;
	eventsFlushed: number;
  bufferSize: number;
	avgFlushTime: number;
  lastFlushTimestamp: number;
}

export class TelemetryEventBus {
  private static instance: TelemetryEventBus;
  private eventBuffer: TelemetryEvent[] = [];
  private sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private metrics: TelemetryMetrics;
  private readonly options: TelemetryOptions = {
    maxBufferSize: 100,
    flushInterval: 30000,
    enableDebug: false,
    endpoint: undefined,
  };

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.metrics = {
      eventsCollected: 0,
      eventsFlushed: 0,
      bufferSize: 0,
      avgFlushTime: 0,
      lastFlushTimestamp: 0,
    };
    this.startAutoFlush();

    if (typeof window !== 'undefined') {
      window.__TELEMETRY__ = this;
    }

    if (this.options.enableDebug) {
      console.log('[Telemetry] Event bus initialized', {
        sessionId: this.sessionId,
        options: this.options,
      });
    }
  }

  static getInstance(): TelemetryEventBus {
    if (!TelemetryEventBus.instance) {
      TelemetryEventBus.instance = new TelemetryEventBus();
    }
    return TelemetryEventBus.instance;
  }

  emitGPUEvent(data: Omit<Telemetry.GPUEvent, 'timestamp' | 'sessionId'>): void {
    const event: Telemetry.GPUEvent = {
      ...data,
      timestamp: performance.now(),
      sessionId: this.sessionId,
    };
    this.addEvent(event);
  }

  emitPerformanceEvent(data: Omit<Telemetry.PerformanceEvent, 'timestamp' | 'sessionId'>): void {
    const event: Telemetry.PerformanceEvent = {
      ...data,
      timestamp: performance.now(),
      sessionId: this.sessionId,
    };
    this.addEvent(event);
  }

  emitError(data: Omit<Telemetry.ErrorEvent, 'timestamp' | 'sessionId'>): void {
    const event: Telemetry.ErrorEvent = {
      ...data,
      timestamp: performance.now(),
      sessionId: this.sessionId,
    };
    this.addEvent(event);

    if (data.type === 'critical') {
      this.flush();
    }
  }

  async measurePerformance<T>(
    operation: string,
    fn: () => Promise<T>,
    component: string = 'unknown'
  ): Promise<T> {
    const start = performance.now();
    let success = false;
    let error: Error | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (err) {
      error = err as Error;
      this.emitError({
        type: 'error',
        message: error.message,
        stack: error.stack,
        component,
      });
      throw err;
    } finally {
      const duration = performance.now() - start;
      this.emitPerformanceEvent({
        type: 'api_latency',
        duration,
        operation,
        success,
      });
    }
  }

  emitMemoryBankUsage(bank: MemoryBank): void {
    const utilizationPercent = (bank.used / bank.size) * 100;
    this.emitPerformanceEvent({
      type: 'cache_hit',
      duration: 0,
      operation: `${bank.type}_usage`,
      success: utilizationPercent < 90,
    });

    if (this.options.enableDebug) {
      console.log(`[Telemetry] ${bank.type} utilization: ${utilizationPercent.toFixed(1)}%`);
    }
  }

  emitVectorEncodingMetrics(
    dimensions: number,
    encodingTime: number,
    compressionRatio: number,
    success: boolean
  ): void {
    this.emitPerformanceEvent({
      type: 'vector_encoding',
      duration: encodingTime,
      operation: `vector_encode_${dimensions}d`,
      success,
    });

    if (this.options.enableDebug) {
      console.log('[Telemetry] Vector encoding', {
        dimensions,
        encodingTime: `${encodingTime.toFixed(2)}ms`,
        compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
        success,
      });
    }
  }

  getMetrics(): TelemetryMetrics & { bufferUtilization: number } {
    return {
      ...this.metrics,
      bufferUtilization: (this.eventBuffer.length / this.options.maxBufferSize) * 100,
    };
  }

  async exportData(): Promise<Blob> {
    const exportData = {
      sessionId: this.sessionId,
      exportedAt: Date.now(),
      metrics: this.getMetrics(),
      events: [...this.eventBuffer],
      environment: {
	userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        viewport:
          typeof window !== 'undefined'
            ? { width: window.innerWidth, height: window.innerHeight }
            : null,
        gpu:
          typeof window !== 'undefined' && window.__GPU_MANAGER__ ? await this.getGPUInfo() : null,
      },
	};
    return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  }

  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const flushStart = performance.now();
    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      if (this.options.endpoint) {
        await this.sendToEndpoint(events);
      }
      this.metrics.eventsFlushed += events.length;
      this.metrics.bufferSize = this.eventBuffer.length;
    } catch (error) {
      const remainingSpace = this.options.maxBufferSize - this.eventBuffer.length;
      if (remainingSpace > 0) {
        this.eventBuffer.unshift(...events.slice(-remainingSpace));
      }
      if (this.options.enableDebug) {
        console.error('[Telemetry] Flush failed:', error);
      }
    }

    const flushTime = performance.now() - flushStart;
    this.metrics.avgFlushTime = (this.metrics.avgFlushTime + flushTime) / 2;
    this.metrics.lastFlushTimestamp = Date.now();
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
    if (typeof window !== 'undefined') {
      delete window.__TELEMETRY__;
    }
  }

  private addEvent(event: TelemetryEvent): void {
    this.eventBuffer.push(event);
    this.metrics.eventsCollected++;
    this.metrics.bufferSize = this.eventBuffer.length;

    if (this.eventBuffer.length >= this.options.maxBufferSize) {
      this.flush();
    }
  }

  private startAutoFlush(): void {
    if (typeof window !== 'undefined') {
      this.flushTimer = setInterval(() => {
        this.flush();
      },
	this.options.flushInterval);
    }
  }

  private async sendToEndpoint(events: TelemetryEvent[]): Promise<void> {
    if (!this.options.endpoint) return;

    const payload = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      events,
    };

    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telemetry endpoint returned ${response.status}`);
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getGPUInfo(): Promise<unknown> {
    try {
      if (typeof window !== 'undefined' && window.__GPU_MANAGER__) {
        return {
          acceleration: window.__GPU_MANAGER__.getAcceleration(),
          contextType: 'detected',
        };
      }
    } catch {
      return null;
    }
    return null;
  }
}

// Export singleton instance
export const telemetryBus = TelemetryEventBus.getInstance();

// Convenience functions
export const trackGPU = (data: Omit<Telemetry.GPUEvent, 'timestamp' | 'sessionId'>) =>
  telemetryBus.emitGPUEvent(data);

export const trackPerformance = (
  data: Omit<Telemetry.PerformanceEvent, 'timestamp' | 'sessionId'>
) => telemetryBus.emitPerformanceEvent(data);

export const trackError = (data: Omit<Telemetry.ErrorEvent, 'timestamp' | 'sessionId'>) =>
  telemetryBus.emitError(data);

export const measureAsync = <T>(
  operation: string,
  fn: () => Promise<T>,
  component: string = 'unknown'
): Promise<T> => telemetryBus.measurePerformance(operation, fn, component);
