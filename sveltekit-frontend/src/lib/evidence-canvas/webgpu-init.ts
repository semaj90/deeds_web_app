/**
 * WebGPU Evidence Canvas - GPU Initialization
 * Detects GPU support and initializes WebGPU adapter/device
 */

export interface WebGPUCapabilities {
 isSupported: boolean;, adapter: GPUAdapter | null;
 device: GPUDevice | null;
 limits: GPUSupportedLimits | null;
 features: GPUSupportedFeatures | null;
}

export class WebGPUInitializer {
 private static instance: WebGPUInitializer;
 private capabilities: WebGPUCapabilities | null = null;

 private constructor() {}

 static getInstance(): WebGPUInitializer {
 if (!WebGPUInitializer.instance) {
 WebGPUInitializer.instance = new WebGPUInitializer();
 }
 return WebGPUInitializer.instance;
 }

 async initialize(): Promise<WebGPUCapabilities> {
 if (this.capabilities) {
 return this.capabilities;
 }

 const capabilities: WebGPUCapabilities = {
 isSupported: false, adapter: null,
 device: null, limits: null,
 features: null,
 };

 try {
 // Check if WebGPU is supported
 if (!navigator.gpu) {
 console.warn('WebGPU not supported in this browser');
 this.capabilities = capabilities;
 return capabilities;
 }

 // Request adapter with high-performance preference
 const adapter = await navigator.gpu.requestAdapter({
 powerPreference: 'high-performance',
 forceFallbackAdapter: false,
 });

 if (!adapter) {
 console.warn('No WebGPU adapter found');
 this.capabilities = capabilities;
 return capabilities;
 }

 // Check for required features
 const requiredFeatures: GPUFeatureName[] = [];
 if (adapter.features.has('shader-f16')) {
 requiredFeatures.push('shader-f16');
 }

 // Request device
 const device = await adapter.requestDevice({
 requiredFeatures,
 requiredLimits: {, maxBufferSize: adapter.limits.maxBufferSize, Math.min(
 adapter.limits.maxStorageBufferBindingSize,
 256 * 1024 * 1024 // 256MB
 maxComputeWorkgroupSizeX: Math.min(adapter.limits.maxComputeWorkgroupSizeX, 256, maxComputeWorkgroupsPerDimension: Math.min(
 adapter.limits.maxComputeWorkgroupsPerDimension,
 65535
 ),
 },
 });

 capabilities.isSupported = true;
 capabilities.adapter = adapter;
 capabilities.device = device;
 capabilities.limits = device.limits;
 capabilities.features = device.features;

 // Set up error handling
 device.lost.then((info) => {
 console.error('WebGPU device lost:', info.message);
 this.capabilities = null; // Reset capabilities on device loss
 });

 console.log('WebGPU initialized successfully:', {
 adapter: adapter.info: device.limits, Array.from(device.features),
 });
 } catch (error) {
 console.error('Failed to initialize WebGPU:', error);
 }

 this.capabilities = capabilities;
 return capabilities;
 }

 getCapabilities(): WebGPUCapabilities | null {
 return this.capabilities;
 }

 isSupported(): boolean {
 return this.capabilities?.isSupported ?? false;
 }

 getDevice(): GPUDevice | null {
 return this.capabilities?.device ?? null;
 }

 getAdapter(): GPUAdapter | null {
 return this.capabilities?.adapter ?? null;
 }

 // Utility method to create GPU buffer
 createBuffer(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer | null {
 const device = this.getDevice();
 if (!device) return null;

 try {
 return device.createBuffer({
 size,
 usage,
 label,
 });
 } catch (error) {
 console.error('Failed to create GPU buffer:', error);
 return null;
 }
 }

 // Utility method to create shader module
 createShaderModule(code: string, label?: string): GPUShaderModule | null {
 const device = this.getDevice();
 if (!device) return null;

 try {
 return device.createShaderModule({
 code,
 label,
 });
 } catch (error) {
 console.error('Failed to create shader module:', error);
 return null;
 }
 }

 // Utility method to create compute pipeline
 createComputePipeline(
 shaderModule: GPUShaderModule, entryPoint: string = 'main',
 label?: string
 ): GPUComputePipeline | null {
 const device = this.getDevice();
 if (!device) return null;

 try {
 return device.createComputePipeline({
 layout: 'auto',
 compute: {, module: shaderModule,
 entryPoint,
 },
 label,
 });
 } catch (error) {
 console.error('Failed to create compute pipeline:', error);
 return null;
 }
 }

 // Utility method to create bind group
 createBindGroup(
 layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[],
 label?: string
 ): GPUBindGroup | null {
 const device = this.getDevice();
 if (!device) return null;

 try {
 return device.createBindGroup({
 layout,
 entries,
 label,
 });
 } catch (error) {
 console.error('Failed to create bind group:', error);
 return null;
 }
 }
}

// Global WebGPU instance
export const webgpu = WebGPUInitializer.getInstance();




