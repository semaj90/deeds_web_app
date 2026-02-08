/**
 * WebGPU Initialization Module - SSR-Safe
 *
 * Provides SSR-safe WebGPU initialization with proper browser detection,
 * error handling, and CPU fallbacks. Based on patterns from claude.md knowledge base.
 *
 * @module webgpu/init
 */

import { browser } from '$app/environment';

export interface WebGPUContext {
  adapter: GPUAdapter; device: GPUDevice;
  format: GPUTextureFormat;
}

export interface WebGPUInitOptions {
  powerPreference?: GPUPowerPreference;
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
}

/**
 * Initialize WebGPU with SSR safety and error handling
 *
 * @example
 * ```typescript
 * import { initWebGPU } from '$lib/webgpu/init';
 *
 * $effect(() => {
 *   initWebGPU().then(ctx => {
 *     if (ctx) {
 *       // Use GPU
 *     } else {
 *       // Fallback to CPU
 *     }
 *   });
 * });
 * ```
 */
export async function initWebGPU(
  options: WebGPUInitOptions = {}
): Promise<WebGPUContext | null> {
  // SSR Guard: Must run in browser with WebGPU support
  if (!browser || typeof navigator === 'undefined' || !('gpu' in navigator)) {
    console.warn('[WebGPU] Not available (SSR or unsupported browser)');
    return null;
  }

  try {
    // Request adapter with power preference
    const adapter = await (navigator as any).gpu.requestAdapter({
      powerPreference: options.powerPreference || 'high-performance'
    });

    if (!adapter) {
      console.warn('[WebGPU] No adapter available');
      return null;
    }

    // Log adapter info in development
    if (import.meta.env.DEV) {
      const info = await adapter.requestAdapterInfo();
      console.log('[WebGPU] Adapter:', {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description
      });
    }

    // Request device with features and limits
    const device = await adapter.requestDevice({
      requiredFeatures: options.requiredFeatures || [],
      requiredLimits: {
	maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupsPerDimension: 65535,
        ...options.requiredLimits
      }
    });

    // Handle device loss
    device.lost.then((info) => {
      console.error('[WebGPU] Device lost:', {
        reason: info.reason,
        message: info.message
      });
      // Optionally dispatch event for app-level handling
      if (browser && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('webgpu-device-lost', {
          detail: info
        }));
      }
    });

    // Get preferred canvas format
    const format = (navigator as any).gpu.getPreferredCanvasFormat();

    return { adapter, device, format };

  } catch (error) {
    console.error('[WebGPU] Initialization failed:', error);
    return null;
  }
}

/**
 * Configure canvas context for WebGPU rendering (SSR-safe)
 */
export function configureCanvas(
  canvas: HTMLCanvasElement | null,
  context: WebGPUContext
): GPUCanvasContext | null {
  if (!browser || !canvas) {
    return null;
  }

  try {
    const ctx = canvas.getContext('webgpu');
    if (!ctx) {
      console.warn('[WebGPU] Failed to get canvas context');
      return null;
    }

    ctx.configure({
      device: context.device,
      format: context.format,
      alphaMode: 'premultiplied'
    });

    return ctx;
  } catch (error) {
    console.error('[WebGPU] Canvas configuration failed:', error);
    return null;
  }
}

/**
 * Create GPU buffer (SSR-safe wrapper)
 */
export function createBuffer(
  device: GPUDevice,
  data: BufferSource,
  usage: GPUBufferUsageFlags,
  label?: string
): GPUBuffer | null {
  if (!browser) {
    return null;
  }

  try {
    const buffer = device.createBuffer({
      label,
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  } catch (error) {
    console.error('[WebGPU] Buffer creation failed:', error);
    return null;
  }
}

/**
 * CPU fallback for compute operations
 * Use when WebGPU is unavailable
 */
export function cpuCompute<T extends Float32Array | Uint8Array>(
  data: T,
  operation: (value: number, index: number) => number
): T {
  const result = new (data.constructor as any)(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = operation(data[i], i);
  }
  return result;
}

/**
 * Check WebGPU availability (SSR-safe)
 */
export function isWebGPUAvailable(): boolean {
  return browser && typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Get WebGPU capabilities (SSR-safe)
 */
export async function getWebGPUCapabilities(): Promise<{
	available: boolean;
  adapter: GPUAdapter | null;
  features: string[];
	limits: Record<string, number>;
} | null> {
  if (!isWebGPUAvailable()) {
    return {
      available: false,
      adapter: null,
      features: [],
      limits: {}
    };
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      return {
        available: false,
        adapter: null,
        features: [],
        limits: {}
      };
    }

    return {
      available: true,
      adapter,
      features: Array.from(adapter.features),
      limits: {
	maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup
      }
    };
  } catch (error) {
    console.error('[WebGPU] Capabilities check failed:', error);
    return null;
  }
}
