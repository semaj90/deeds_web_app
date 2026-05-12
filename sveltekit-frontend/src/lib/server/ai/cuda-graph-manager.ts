import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let bridge: any = null;

try {
  bridge = require('../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
} catch {
  bridge = null;
}

/**
 * CudaGraphManager
 * 
 * Manages CUDA Graph capture and replay for the LibTorch N-API bridge.
 * NVIDIA describes CUDA Graphs as separating graph definition from graph execution, 
 * then launching an instantiated graph repeatedly to reduce overhead.
 */
export class CudaGraphManager {
  private static capturedGraphs = new Map<string, { shape: [number, number]; capturedAt: number }>();

  /**
   * Reports if the CUDA bridge is loaded and supports graph operations.
   */
  static isAvailable(): boolean {
    return Boolean(bridge?.captureGraph && bridge?.replayGraph);
  }

  /**
   * Capture a graph for a specific tensor shape if it doesn't already exist.
   * Reports success/failure based on bridge availability.
   */
  static async captureIfMissing(key: string, shape: [number, number]): Promise<boolean> {
    if (!this.isAvailable()) return false;
    if (this.capturedGraphs.has(key)) return true;

    try {
      bridge.captureGraph(key, shape[0], shape[1]);
      this.capturedGraphs.set(key, {
        shape,
        capturedAt: Date.now()
      });
      return true;
    } catch (err) {
      console.warn(`[CudaGraph] Capture failed for key ${key}:`, err);
      return false;
    }
  }

  /**
   * Execute a captured graph with new input data.
   * Falls back to null if bridge is unavailable or graph isn't captured.
   */
  static async replay(key: string, data: Float32Array): Promise<Float32Array | null> {
    if (!this.isAvailable()) return null;
    if (!this.capturedGraphs.has(key)) return null;

    try {
      const output = bridge.replayGraph(key, data);
      return output instanceof Float32Array ? output : Float32Array.from(output);
    } catch (err) {
      console.warn(`[CudaGraph] Replay failed for key ${key}:`, err);
      return null;
    }
  }

  /**
   * Warm up common shapes to avoid capture latency during user requests.
   */
  static async warmup(): Promise<void> {
    await this.captureIfMissing('topology:1x768', [1, 768]);
    await this.captureIfMissing('topology:8x768', [8, 768]);
    await this.captureIfMissing('topology:32x768', [32, 768]);
  }
}
