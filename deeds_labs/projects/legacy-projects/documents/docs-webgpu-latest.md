# WebGPU Types and APIs - Latest Specification

## Core Interfaces

### GPUDevice
```typescript
interface GPUDevice extends EventTarget {
  readonly adapter: GPUAdapter;
  readonly features: GPUSupportedFeatures;
  readonly limits: GPUSupportedLimits;
  readonly queue: GPUQueue;

  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline;

  destroy(): void;
  pushErrorScope(filter: GPUErrorFilter): void;
  popErrorScope(): Promise<GPUError | null>;
}
```

### GPUAdapter
```typescript
interface GPUAdapter {
  readonly features: GPUSupportedFeatures;
  readonly limits: GPUSupportedLimits;
  readonly info: GPUAdapterInfo;

  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice | null>;
  requestAdapterInfo(): Promise<GPUAdapterInfo>;
}
```

### GPUBuffer
```typescript
interface GPUBuffer extends GPUObjectBase {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  readonly mapState: GPUBufferMapState;

  mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}
```

### GPUTexture
```typescript
interface GPUTexture extends GPUObjectBase {
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly dimension: GPUTextureDimension;
  readonly format: GPUTextureFormat;
  readonly usage: GPUTextureUsageFlags;

  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView;
  destroy(): void;
}
```

## Best Practices for API Routes

1. **GPU Resource Management**: Always clean up GPU resources with `destroy()`
2. **Error Handling**: Use `pushErrorScope` and `popErrorScope` for error management
3. **Type Safety**: Use proper TypeScript interfaces from @webgpu/types
4. **Memory Management**: Monitor buffer usage and cleanup appropriately
5. **Async Patterns**: Handle GPU operations asynchronously with proper error catching

## Modern WebGPU Patterns for SvelteKit

```typescript
// In your API route (+server.ts)
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!globalThis.navigator?.gpu) {
    return new Response('WebGPU not supported', { status: 400 });
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return new Response('No WebGPU adapter found', { status: 500 });
    }

    const device = await adapter.requestDevice({
      requiredFeatures: ['timestamp-query'] as const,
      requiredLimits: {
        maxBufferSize: 1024 * 1024 * 100
      }
    });

    // Use device for GPU operations
    const buffer = device.createBuffer({
      size: 1024,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    // Always cleanup
    buffer.destroy();
    device.destroy();

    return Response.json({ success: true });
  } catch (error) {
    return new Response(`WebGPU error: ${error.message}`, { status: 500 });
  }
};
```

**Topics Covered**: GPUDevice, GPUAdapter, GPUBuffer, GPUTexture, typescript-definitions, api-routes

*Generated via Context7 MCP Integration - 2025-09-24*