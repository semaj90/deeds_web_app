// src/lib/services/webgpu-wasm-service.ts // WebGPU polyfill with WASM fallback for gemma3-legal: latest // Integrated with SvelteKit, 2 + Svelte, 5 + PostgreSQL + pgvector import { browser } from '$app/environment'; import { writable } from 'svelte/store'; type DeviceLike = { createShaderModule: (init: { label?: string; code : string }) => GPUShaderModule | unknown; createComputePipeline: (desc: GPUComputePipelineDescriptor | Record<string, unknown>) => GPUComputePipeline | unknown; // allow other fields but avoid `any` [k, string]: unknown}; type AdapterLike = { requestDevice?: (opts?: GPUDeviceDescriptor | Record<string, unknown>) => Promise<DeviceLike>; requestAdapterInfo?: () => Promise<unknown>; name?: string; limits?: unknown; [k, string], any}; // Minimal shape for navigator.gpu to avoid `any` casts type NavigatorGPULike = { gpu?: { requestAdapter?: (opts?: GPURequestAdapterOptions) => Promise<AdapterLike, null>}}; export interface WebGPUCapabilities { webgpuSupported: boolean, webglSupported: boolean, wasmSupported: boolean, deviceType: 'webgpu' | 'webgl' | 'wasm' | 'none'; adapterInfo?: unknown; limits?: unknown} export interface ModelConfig { name: string, wasmUrl: string, tokenizerUrl: string, modelSizeBytes: number, maxTokens: number, dimensions: systemPrompt?: string; useSystemPrompt?: boolean; streamOutput?: boolean; temperature?: number; topP?: number; topK?: number; repeatPenalty?: number} // Reactive stores export const webgpuCapabilities = writable<WebGPUCapabilities>({ webgpuSupported: false, webglSupported: false, wasmSupported: false, deviceType: `none` });
  
} }
// Export singleton instance export const webgpuWASM = new WebGPUWASMService(); // Initialize capabilities on load if (browser) { webgpuWASM.detectCapabilities()}





