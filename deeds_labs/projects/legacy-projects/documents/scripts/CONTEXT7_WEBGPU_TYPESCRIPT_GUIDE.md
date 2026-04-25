# 🔥 Context7 WebGPU TypeScript Integration Guide

Complete documentation for WebGPU TypeScript integration with SvelteKit 2, Chrome browser support, and legal AI tensor processing.

## 🚀 Quick Setup

### 1. Essential Dependencies

```bash
# WebGPU TypeScript types (latest stable)
npm install --save-dev @webgpu/types@0.1.64

# Verify installation
npm list @webgpu/types
```

### 2. TypeScript Configuration

```json
// tsconfig.json - Production-ready WebGPU config
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": [
      "svelte",
      "vite/client",
      "@webgpu/types",
      "@sveltejs/kit"
    ],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true
  }
}
```

### 3. Chrome Browser Requirements

```bash
# Chrome 113+ required
# Enable WebGPU flag: chrome://flags/#enable-webgpu
# Production: HTTPS required for navigator.gpu access
```

## 🎯 Core Integration Patterns

### WebGPU Service Class

```typescript
// src/lib/services/webgpu-legal-processor.ts
import type {
  GPUDevice,
  GPUAdapter,
  GPUBuffer,
  GPUComputePipeline,
  GPUBindGroup
} from '@webgpu/types';

export interface LegalTensorConfig {
  workgroupSize: [number, number, number];
  bufferSize: number;
  precision: 'float32' | 'float16' | 'int8';
}

export class WebGPULegalProcessor {
  private device: GPUDevice | null = null;
  private adapter: GPUAdapter | null = null;
  private computePipeline: GPUComputePipeline | null = null;

  async initialize(): Promise<boolean> {
    try {
      // Check WebGPU availability
      if (!navigator.gpu) {
        console.warn('WebGPU not supported in this browser');
        return false;
      }

      // Request adapter with legal AI optimizations
      this.adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (!this.adapter) {
        console.error('Failed to get WebGPU adapter');
        return false;
      }

      // Request device with required features
      this.device = await this.adapter.requestDevice({
        requiredFeatures: ['shader-f16'] as GPUFeatureName[],
        requiredLimits: {
          maxComputeWorkgroupsPerDimension: 65535,
          maxStorageBufferBindingSize: 134217728 // 128MB
        }
      });

      // Initialize compute pipeline for legal document processing
      await this.setupComputePipeline();

      return true;
    } catch (error) {
      console.error('WebGPU initialization failed:', error);
      return false;
    }
  }

  private async setupComputePipeline(): Promise<void> {
    if (!this.device) throw new Error('Device not initialized');

    const shaderModule = this.device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> inputBuffer: array<f32>;
        @group(0) @binding(1) var<storage, read_write> outputBuffer: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          let index = id.x;
          if (index >= arrayLength(&inputBuffer)) { return; }

          // Legal document tensor processing
          outputBuffer[index] = inputBuffer[index] * 2.0; // Example operation
        }
      `
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' }
        }
      ]
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      }
    });
  }

  async processLegalTensors(
    inputData: Float32Array,
    config: LegalTensorConfig = {
      workgroupSize: [64, 1, 1],
      bufferSize: inputData.length * 4,
      precision: 'float32'
    }
  ): Promise<Float32Array> {
    if (!this.device || !this.computePipeline) {
      throw new Error('WebGPU not properly initialized');
    }

    // Create input buffer
    const inputBuffer = this.device.createBuffer({
      size: config.bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Create output buffer
    const outputBuffer = this.device.createBuffer({
      size: config.bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create staging buffer for reading results
    const stagingBuffer = this.device.createBuffer({
      size: config.bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Upload input data
    this.device.queue.writeBuffer(inputBuffer, 0, inputData);

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } }
      ]
    });

    // Execute compute shader
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(inputData.length / config.workgroupSize[0]));
    passEncoder.end();

    // Copy output to staging buffer
    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, config.bufferSize);

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Read results
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(stagingBuffer.getMappedRange());
    const outputData = new Float32Array(result);
    stagingBuffer.unmap();

    // Cleanup
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return outputData;
  }

  async getDeviceInfo() {
    if (!this.adapter) return null;

    const info = await this.adapter.requestAdapterInfo();
    const features = Array.from(this.device?.features || []);
    const limits = this.device?.limits;

    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
      features,
      limits: limits ? {
        maxBufferSize: limits.maxBufferSize,
        maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize
      } : null
    };
  }
}
```

### Svelte 5 Component with WebGPU

```svelte
<!-- src/lib/components/legal/WebGPUTensorProcessor.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { WebGPULegalProcessor } from '$lib/services/webgpu-legal-processor';
  import type { GPUDevice } from '@webgpu/types';

  // Svelte 5 runes (not export let)
  let webgpuProcessor = $state<WebGPULegalProcessor | null>(null);
  let isSupported = $state(false);
  let isInitialized = $state(false);
  let deviceInfo = $state<any>(null);
  let processingResults = $state<string[]>([]);
  let isProcessing = $state(false);

  onMount(async () => {
    webgpuProcessor = new WebGPULegalProcessor();
    isSupported = await webgpuProcessor.initialize();

    if (isSupported) {
      isInitialized = true;
      deviceInfo = await webgpuProcessor.getDeviceInfo();
    }
  });

  async function processLegalData() {
    if (!webgpuProcessor || !isInitialized) return;

    isProcessing = true;
    try {
      // Sample legal tensor data
      const legalTensorData = new Float32Array([
        1.0, 2.0, 3.0, 4.0, 5.0,  // Document embeddings
        0.8, 0.9, 0.7, 0.95, 0.85  // Confidence scores
      ]);

      const results = await webgpuProcessor.processLegalTensors(legalTensorData);

      processingResults = [
        ...processingResults,
        `Processed ${results.length} tensor elements at ${new Date().toLocaleTimeString()}`
      ];
    } catch (error) {
      console.error('WebGPU processing failed:', error);
      processingResults = [
        ...processingResults,
        `Error: ${error.message}`
      ];
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="webgpu-processor">
  <h3>🔥 WebGPU Legal Tensor Processor</h3>

  {#if !isSupported}
    <div class="warning">
      <p>⚠️ WebGPU not supported in this browser</p>
      <p>Requirements: Chrome 113+ with WebGPU enabled</p>
      <a href="chrome://flags/#enable-webgpu" target="_blank">
        Enable WebGPU in Chrome
      </a>
    </div>
  {:else if isInitialized}
    <div class="device-info">
      <h4>🖥️ GPU Device Info</h4>
      {#if deviceInfo}
        <ul>
          <li><strong>Vendor:</strong> {deviceInfo.vendor}</li>
          <li><strong>Architecture:</strong> {deviceInfo.architecture}</li>
          <li><strong>Device:</strong> {deviceInfo.device}</li>
          <li><strong>Features:</strong> {deviceInfo.features.join(', ')}</li>
        </ul>
      {/if}
    </div>

    <div class="controls">
      <button
        onclick={processLegalData}
        disabled={isProcessing}
        class="process-btn"
      >
        {isProcessing ? '⚡ Processing...' : '🚀 Process Legal Tensors'}
      </button>
    </div>

    <div class="results">
      <h4>📊 Processing Results</h4>
      {#each processingResults as result}
        <div class="result-item">{result}</div>
      {/each}
    </div>
  {:else}
    <div class="loading">🔄 Initializing WebGPU...</div>
  {/if}
</div>

<style>
  .webgpu-processor {
    padding: 1rem;
    border: 1px solid #333;
    border-radius: 8px;
    background: #1a1a1a;
    color: #fff;
  }

  .warning {
    background: #ff4444;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .device-info {
    background: #0066cc;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .process-btn {
    background: #00cc66;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .process-btn:disabled {
    background: #666;
    cursor: not-allowed;
  }

  .result-item {
    background: #333;
    padding: 0.5rem;
    margin: 0.25rem 0;
    border-radius: 4px;
    font-family: monospace;
  }
</style>
```

### WebGPU Diagnostics Service

```typescript
// src/lib/utils/webgpu-diagnostics.ts
export interface WebGPUDiagnostics {
  isSupported: boolean;
  browserSupport: {
    hasNavigatorGPU: boolean;
    browserName: string;
    browserVersion: string;
    isChrome: boolean;
    chromeVersion?: number;
  };
  adapterInfo?: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
  };
  deviceLimits?: {
    maxBufferSize: number;
    maxComputeWorkgroupsPerDimension: number;
    maxStorageBufferBindingSize: number;
  };
  features: string[];
  errors: string[];
  recommendations: string[];
}

export async function runWebGPUDiagnostics(): Promise<WebGPUDiagnostics> {
  const diagnostics: WebGPUDiagnostics = {
    isSupported: false,
    browserSupport: getBrowserSupport(),
    features: [],
    errors: [],
    recommendations: []
  };

  try {
    // Check navigator.gpu availability
    if (!diagnostics.browserSupport.hasNavigatorGPU) {
      diagnostics.errors.push('navigator.gpu is not available');
      addBrowserRecommendations(diagnostics);
      return diagnostics;
    }

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      diagnostics.errors.push('Failed to get WebGPU adapter');
      return diagnostics;
    }

    // Get adapter info
    const adapterInfo = await adapter.requestAdapterInfo();
    diagnostics.adapterInfo = {
      vendor: adapterInfo.vendor,
      architecture: adapterInfo.architecture,
      device: adapterInfo.device,
      description: adapterInfo.description
    };

    // Request device
    const device = await adapter.requestDevice();
    diagnostics.features = Array.from(device.features);
    diagnostics.deviceLimits = {
      maxBufferSize: device.limits.maxBufferSize,
      maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize
    };

    diagnostics.isSupported = true;

    // Add performance recommendations
    if (diagnostics.deviceLimits.maxStorageBufferBindingSize < 134217728) {
      diagnostics.recommendations.push('Large tensor processing may be limited by buffer size');
    }

    if (!diagnostics.features.includes('shader-f16')) {
      diagnostics.recommendations.push('Consider enabling shader-f16 for better performance');
    }

  } catch (error) {
    diagnostics.errors.push(`WebGPU initialization error: ${error.message}`);
  }

  return diagnostics;
}

function getBrowserSupport() {
  const userAgent = navigator.userAgent;
  const hasNavigatorGPU = 'gpu' in navigator;

  const isChrome = /Chrome/.test(userAgent);
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  const chromeVersion = chromeMatch ? parseInt(chromeMatch[1]) : undefined;

  return {
    hasNavigatorGPU,
    browserName: isChrome ? 'Chrome' : 'Unknown',
    browserVersion: chromeVersion?.toString() || 'Unknown',
    isChrome,
    chromeVersion
  };
}

function addBrowserRecommendations(diagnostics: WebGPUDiagnostics) {
  if (!diagnostics.browserSupport.isChrome) {
    diagnostics.recommendations.push('Use Chrome 113+ for best WebGPU support');
  } else if (diagnostics.browserSupport.chromeVersion && diagnostics.browserSupport.chromeVersion < 113) {
    diagnostics.recommendations.push('Update Chrome to version 113 or later');
  } else {
    diagnostics.recommendations.push('Enable WebGPU in chrome://flags/#enable-webgpu');
  }
}
```

## 🔧 Context7 Integration

### Search WebGPU Documentation

```typescript
// Query Context7 for WebGPU TypeScript documentation
const webgpuDocs = await fetch('/api/context7/docs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'search',
    query: 'WebGPU TypeScript @webgpu/types GPUDevice Chrome',
    library: 'webgpu',
    limit: 10,
    threshold: 0.8
  })
});

const { results } = await webgpuDocs.json();
```

### SvelteKit 2 Patterns

```typescript
// Search for SvelteKit 2 + WebGPU integration patterns
const svelteKitWebGPU = await fetch('http://localhost:8090/api/rag/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'SvelteKit 2 WebGPU runes $state Chrome browser',
    library: 'sveltekit',
    limit: 5
  })
});
```

## 🧪 Testing & Debugging

### Test Commands

```bash
# Check WebGPU documentation in Context7
curl -X POST http://localhost:8090/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "WebGPU TypeScript Chrome", "library": "webgpu"}'

# List WebGPU topics
curl http://localhost:8090/api/rag/topics?library=webgpu

# Test through SvelteKit API
curl -X POST http://localhost:5173/api/context7/docs \
  -H "Content-Type: application/json" \
  -d '{"action": "search", "query": "WebGPU compute shaders", "library": "webgpu"}'
```

### Browser Testing

```javascript
// Test in Chrome DevTools console
if (navigator.gpu) {
  navigator.gpu.requestAdapter().then(adapter => {
    if (adapter) {
      console.log('✅ WebGPU adapter available');
      adapter.requestAdapterInfo().then(info => {
        console.log('GPU Info:', info);
      });
    } else {
      console.log('❌ No WebGPU adapter');
    }
  });
} else {
  console.log('❌ navigator.gpu not available');
}
```

## 🔍 Troubleshooting

### Common Issues

1. **TypeScript errors with @webgpu/types**
   ```bash
   npm install --save-dev @webgpu/types@0.1.64
   # Ensure tsconfig.json includes "@webgpu/types" in types array
   ```

2. **navigator.gpu is undefined**
   - Check Chrome version (113+ required)
   - Enable chrome://flags/#enable-webgpu
   - Use HTTPS in production

3. **Svelte 5 syntax errors**
   ```typescript
   // ✅ Correct Svelte 5 syntax
   let webgpuDevice = $state<GPUDevice | null>(null);

   // ❌ Old Svelte 4 syntax (don't use)
   export let webgpuDevice: GPUDevice | null = null;
   ```

4. **WebGPU adapter request fails**
   - Check GPU driver updates
   - Try different powerPreference settings
   - Verify GPU hardware support

### Performance Optimization

```typescript
// Optimize for legal document processing
const config = {
  powerPreference: 'high-performance' as const,
  requiredFeatures: ['shader-f16'] as GPUFeatureName[],
  requiredLimits: {
    maxComputeWorkgroupsPerDimension: 65535,
    maxStorageBufferBindingSize: 134217728 // 128MB for large tensors
  }
};
```

## 📊 Production Deployment

### Environment Requirements

```bash
# Production checklist
✅ Chrome 113+ users
✅ HTTPS enabled
✅ WebGPU flags enabled
✅ GPU drivers updated
✅ Error fallbacks implemented
```

### Fallback Strategy

```typescript
class LegalProcessorWithFallback {
  async process(data: Float32Array): Promise<Float32Array> {
    try {
      // Try WebGPU first
      return await this.webgpuProcessor.processLegalTensors(data);
    } catch (error) {
      console.warn('WebGPU failed, falling back to CPU:', error);
      // CPU fallback
      return this.cpuProcessor.process(data);
    }
  }
}
```

---

**🚀 Built for**: Legal AI tensor processing, SvelteKit 2, Chrome 113+, TypeScript 5.0+

**📚 Context7 Ready**: Fully integrated with Context7 RAG documentation system