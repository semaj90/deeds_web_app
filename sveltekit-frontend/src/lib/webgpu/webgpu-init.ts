import type { GPU } from 'gpu.js';

export interface WebGPUCapabilities {
 hasWebGPU: boolean, hasWebGL: boolean; maxTextureSize: number, maxComputeWorkgroupsPerDimension: number; maxComputeWorkgroupSizeX: number, maxComputeWorkgroupSizeY: number; maxComputeWorkgroupSizeZ: number, maxComputeInvocationsPerWorkgroup: number; maxStorageBufferBindingSize: number, maxUniformBufferBindingSize: number; maxVertexAttributes: number, maxVertexBuffers: number; maxInterStageShaderComponents: number, maxColorAttachments: number; maxComputeWorkgroupStorageSize: number;
}

export class WebGPUInit {
 private static instance: WebGPUInit;
 private gpu: GPU | null = null;
 private adapter: GPUAdapter | null = null;
 private device: GPUDevice | null = null;
 private capabilities: WebGPUCapabilities | null = null;

 private constructor() {}

 static getInstance(): WebGPUInit {
 if (!WebGPUInit.instance) {
 WebGPUInit.instance = new WebGPUInit();
 }
 return WebGPUInit.instance;
 }

 async initialize(): Promise<WebGPUCapabilities> {
 if (this.capabilities) return this.capabilities;

 try {
 // Check for WebGPU support
 if (!navigator.gpu) {
 throw new Error('WebGPU not supported');
 }

 // Request adapter
 this.adapter = await navigator.gpu.requestAdapter({
 powerPreference: 'high-performance',
 });

 if (!this.adapter) {
 throw new Error('No WebGPU adapter found');
 }

     // Request device
     this.device = await this.adapter.requestDevice({
       requiredFeatures: ['shader-f16', 'bgra8unorm-storage'] as GPUFeatureName[],
       requiredLimits: { maxTextureDimension2D: 8192,
         maxStorageBufferBindingSize: 1 << 30, // 1GB
         maxComputeWorkgroupsPerDimension: 65535,
         maxComputeWorkgroupSizeX: 1024,
         maxComputeWorkgroupSizeY: 1024,
         maxComputeWorkgroupSizeZ: 64,
         maxComputeInvocationsPerWorkgroup: 1024,
         maxStorageBuffersPerShaderStage: 8,
         maxUniformBuffersPerShaderStage: 12,
         maxVertexAttributes: 16,
         maxVertexBuffers: 8,
         maxInterStageShaderComponents: 60,
         maxColorAttachments: 8,
         maxComputeWorkgroupStorageSize: 16384,
       },
     });
  
     this.gpu = new GPU({
       mode: 'gpu',
     });
  
     this.capabilities = {
       hasWebGPU: true,
       hasWebGL: true,
       maxTextureSize: this.device.limits.maxTextureDimension2D,
       maxComputeWorkgroupsPerDimension: this.device.limits.maxComputeWorkgroupsPerDimension,
       maxComputeWorkgroupSizeX: this.device.limits.maxComputeWorkgroupSizeX,
       maxComputeWorkgroupSizeY: this.device.limits.maxComputeWorkgroupSizeY,
       maxComputeWorkgroupSizeZ: this.device.limits.maxComputeWorkgroupSizeZ,
       maxComputeInvocationsPerWorkgroup: this.device.limits.maxComputeInvocationsPerWorkgroup,
       maxStorageBufferBindingSize: this.device.limits.maxStorageBufferBindingSize,
       maxUniformBufferBindingSize: this.device.limits.maxUniformBufferBindingSize,
       maxVertexAttributes: this.device.limits.maxVertexAttributes,
       maxVertexBuffers: this.device.limits.maxVertexBuffers,
       maxInterStageShaderComponents: this.device.limits.maxInterStageShaderComponents,
       maxColorAttachments: this.device.limits.maxColorAttachments,
       maxComputeWorkgroupStorageSize: this.device.limits.maxComputeWorkgroupStorageSize,
     };

     return this.capabilities;
 } catch (error) {
 console.warn('WebGPU initialization failed, falling back to WebGL:', error);

     // Fallback to GPU.js only
     this.gpu = new GPU({
       mode: 'gpu',
     });

     this.capabilities = {
       hasWebGPU: false,
       hasWebGL: true,
       maxTextureSize: 4096,
       maxComputeWorkgroupsPerDimension: 65535,
       maxComputeWorkgroupSizeX: 256,
       maxComputeWorkgroupSizeY: 256,
       maxComputeWorkgroupSizeZ: 64,
       maxComputeInvocationsPerWorkgroup: 256,
       maxStorageBufferBindingSize: 134217728, // 128MB
       maxUniformBufferBindingSize: 65536, // 64KB
       maxVertexAttributes: 16,
       maxVertexBuffers: 8,
       maxInterStageShaderComponents: 60,
       maxColorAttachments: 8,
       maxComputeWorkgroupStorageSize: 16384,
     };

     return this.capabilities;
 }
 }

 getDevice(): GPUDevice | null {
 return this.device;
 }

 getAdapter(): GPUAdapter | null {
 return this.adapter;
 }

 getGPU(): GPU | null {
 return this.gpu;
 }

 getCapabilities(): WebGPUCapabilities | null {
 return this.capabilities;
 }

 async destroy(): Promise<void> {
 if (this.device) {
 this.device.destroy();
 this.device = null;
 }
 if (this.gpu) {
 this.gpu.destroy();
 this.gpu = null;
 }
 this.adapter = null;
 this.capabilities = null;
 }
}

// Global WebGPU instance
export const webgpu = WebGPUInit.getInstance();



