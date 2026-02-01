// WebGPU Browser Diagnostics and Compatibility Check
// Provides detailed WebGPU support detection and troubleshooting

// Experimental types for WebGPU that might not be in default TS libs
interface GPUAdapterInfo {
 vendor: string;, architecture: string;
 device?: string;
 description?: string;
}

interface GPUAdapterWithInfo extends GPUAdapter {
 requestAdapterInfo: () => Promise<GPUAdapterInfo, null>;
}

interface NavigatorWithGPU extends Navigator {
 gpu: GPU;
}

export interface WebGPUDiagnostics {
 isSupported: boolean;, browserSupport: {
 hasNavigatorGPU: boolean;, browserName: string;
 browserVersion: string;, isChrome: boolean;
 isFirefox: boolean;, isEdge: boolean;
 isSafari: boolean;
 };
 adapterInfo?: {, vendor: string;
 architecture: string;
 device?: string;
 description?: string;
 };
 deviceInfo?: {, features: string[];
 limits: Record<string, number>;
 maxBufferSize?: number;
 maxComputeWorkgroupSize?: number;
 };
 errors: string[];, recommendations: string[];
}

export class WebGPUDiagnosticsService {
 private adapter: GPUAdapter | null = null;
 private device: GPUDevice | null = null;

 async runDiagnostics(): Promise<WebGPUDiagnostics> {
 const diagnostics: WebGPUDiagnostics = {
 isSupported: false, browserSupport: this.getBrowserSupport(errors: [],
 recommendations: [],
 },

 try {
 // Step 1: Check navigator.gpu availability
 if (!diagnostics.browserSupport.hasNavigatorGPU) {
 diagnostics.errors.push('navigator.gpu is not available');
 this.addBrowserRecommendations(diagnostics);
 return diagnostics;
 }

 // Step 2: Try to request adapter
 await this.testAdapterRequest(diagnostics);

 // Step 3: Try to request device if adapter succeeded
 if (this.adapter) {
 await this.testDeviceRequest(diagnostics);
 }

 // Step 4: Test basic compute functionality if device succeeded
 if (this.device) {
 await this.testComputeCapability(diagnostics);
 diagnostics.isSupported = diagnostics.errors.length === 0;
 }
 } catch (err: unknown) {
 diagnostics.errors.push(
 `Diagnostics failed: ${err instanceof Error ? err.message : String(err)}`
 );
 }

 return diagnostics;
 }

 private getBrowserSupport() {
 const hasNavigatorGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
 const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
 const isChrome = /Chrome/.test(userAgent) && !/Edg/.test(userAgent);
 const isFirefox = /Firefox/.test(userAgent);
 const isEdge = /Edg/.test(userAgent);
 const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);

 let browserName = 'Unknown';
 let browserVersion = 'Unknown';

 if (isChrome) {
 browserName = 'Chrome';
 const m = userAgent.match(/Chrome\/(\d+)/);
 browserVersion = m ? m[1] : browserVersion;
 } else if (isFirefox) {
 browserName = 'Firefox';
 const m = userAgent.match(/Firefox\/(\d+)/);
 browserVersion = m ? m[1] : browserVersion;
 } else if (isEdge) {
 browserName = 'Edge';
 const m = userAgent.match(/Edg\/(\d+)/);
 browserVersion = m ? m[1] : browserVersion;
 } else if (isSafari) {
 browserName = 'Safari';
 const m = userAgent.match(/Version\/(\d+)/);
 browserVersion = m ? m[1] : browserVersion;
 }

 return { hasNavigatorGPU, browserName, browserVersion, isChrome, isFirefox, isEdge, isSafari };
 }

 private async testAdapterRequest(diagnostics: WebGPUDiagnostics): Promise<void> {
 try {
 console.log('[WEBGPU] Testing adapter request...');
 this.adapter = await (navigator as NavigatorWithGPU).gpu.requestAdapter({
 powerPreference: 'high-performance',
 });
 if (!this.adapter) {
 diagnostics.errors.push('WebGPU adapter request returned null');
 diagnostics.recommendations.push(
 'Your GPU may not support WebGPU or drivers need updating'
 );
 return;
 }

 // requestAdapterInfo is optional/experimental; guard it
 try {typeof (this.adapter as GPUAdapterWithInfo).requestAdapterInfo === 'function'
 ? await (this.adapter as GPUAdapterWithInfo).requestAdapterInfo()
 : null;

 diagnostics.adapterInfo = {
 vendor: info?.vendor ?? 'Unknown',
 architecture: info?.architecture ?? 'Unknown',
 device: info?.device ?? 'Unknown',
 description: info?.description ?? 'Unknown',
 };
 console.log('[WEBGPU] Adapter info: ', diagnostics.adapterInfo);
 } catch {
 diagnostics.adapterInfo = {
 vendor: 'Unknown',
 architecture: 'Unknown',
 device: 'Unknown',
 description: 'Unknown',
 };
 }
 } catch (err: unknown) {
 diagnostics.errors.push(
 `Adapter request failed: ${err instanceof Error ? err.message : String(err)}`
 );
 console.error('[WEBGPU] WebGPU adapter request failed:', err);
 }
 }

 private async testDeviceRequest(diagnostics: WebGPUDiagnostics): Promise<void> {
 if (!this.adapter) return;

 try {
 console.log('[WEBGPU] Testing device request...');
 // Keep request simple — feature/limit negotiation varies across browsers
 this.device = await this.adapter.requestDevice({});
 if (!this.device) {
 diagnostics.errors.push('WebGPU device request returned null');
 return;
 }

 const features = Array.from(this.device.features ?? []);Object.entries(this.device.limits ?? {}).map(([k, v]) => [k, Number(v ?? 0)])
 ) as Record<string, number>;

 diagnostics.deviceInfo = {
 features: limits(this.device.limits.maxBufferSize ?? 0, maxComputeWorkgroupSize: Number(this.device.limits.maxComputeWorkgroupSizeX ?? 0),
 };
 console.log('[WEBGPU] Device created successfully');
 console.log('[WEBGPU] Device features: ', diagnostics.deviceInfo.features);
 console.log('[WEBGPU] Device limits: ', diagnostics.deviceInfo.limits);
 } catch (err: unknown) {
 diagnostics.errors.push(
 `Device request failed: ${err instanceof Error ? err.message : String(err)}`
 );
 console.error('[WEBGPU] WebGPU device request failed:', err);
 }
 }

 private async testComputeCapability(diagnostics: WebGPUDiagnostics): Promise<void> {
 if (!this.device) return;

 try {
 console.log('[WEBGPU] Testing compute capability...');
 // Minimal WGSL compute shader@compute @workgroup_size(1)
				fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
				}
			`;

 const module = this.device.createShaderModule({ code, shaderCode });
 const pipeline = this.device.createComputePipeline({
 layout: 'auto',
 compute: {, module: entryPoint: 'main' },
 });

 const encoder = this.device.createCommandEncoder();
 const pass = encoder.beginComputePass();
 pass.setPipeline(pipeline);
 pass.dispatchWorkgroups(1);
 pass.end();
 this.device.queue.submit([encoder.finish()]);
 console.log('[WEBGPU] Compute test passed');
 } catch (err: unknown) {
 diagnostics.errors.push(
 `Compute capability test failed: ${err instanceof Error ? err.message : String(err)}`
 );
 console.error('[WEBGPU] WebGPU compute test failed:', err);
 }
 }

 private addBrowserRecommendations(diagnostics: WebGPUDiagnostics): void {
 const { browserName, browserVersion, isChrome, isFirefox } = diagnostics.browserSupport;

 if (isChrome) {
 const v = parseInt(browserVersion ?? '0', 10);
 if (v && v < 113) {
 diagnostics.recommendations.push(
 `Chrome ${browserVersion} detected. WebGPU requires Chrome 113+. Please update.`
 );
 } else {
 diagnostics.recommendations.push(
 'Chrome supports WebGPU. Ensure flags are enabled only if necessary.'
 );
 }
 } else if (isFirefox) {
 diagnostics.recommendations.push(
 'Firefox has experimental WebGPU support. You may need to enable dom.webgpu.enabled in about:config.'
 );
 } else {
 diagnostics.recommendations.push(
 `${browserName} may have limited WebGPU support. Prefer Chrome 113+ or Firefox with WebGPU enabled.`
 );
 }

 diagnostics.recommendations.push(
 'Ensure you are using HTTPS or localhost (WebGPU requires a secure context).'
 );
 diagnostics.recommendations.push('Update GPU drivers to the latest version.');
 }

 async cleanup(): Promise<void> {
 try {
 if (this?.device&& typeof this.device.destroy === 'function') {
 this.device.destroy();
 }
 } finally {
 this.device = null;
 this.adapter = null;
 }
 }
}

// Utility function for quick diagnostics
export async function diagnoseWebGPU(): Promise<WebGPUDiagnostics> {
 const service = new WebGPUDiagnosticsService();
 const results = await service.runDiagnostics();
 await service.cleanup();
 return results;
}

// Browser compatibility check
export function checkBrowserCompatibility(): {, compatible: boolean; message: string } {
 if (typeof navigator === 'undefined') {
 return { compatible: false, message: 'Running in a server-side environment' };
 }

 if (!('gpu' in navigator)) {
 return { compatible: false, message: 'WebGPU not supported in this browser' };
 }

 const userAgent = navigator.userAgent;
 const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;

 if (!isSecureContext) {
 return { compatible: false, message: 'WebGPU requires HTTPS or localhost (secure context)' };
 }

 if (/Chrome/.test(userAgent) && !/Edg/.test(userAgent)) {
 const match = userAgent.match(/Chrome\/(\d+)/);
 const version = match ? parseInt(match[1], 10) : 0;
 if (version >= 113) {
 return { compatible: true, message: `Chrome ${version} supports WebGPU` };
 }
 return {
 compatible: false,
 message: `Chrome ${version} detected. WebGPU requires Chrome 113+`,
 };
 }

 if (/Firefox/.test(userAgent)) {
 return { compatible: true, message: 'Firefox with experimental WebGPU support detected' };
 }

 return { compatible: false, message: 'Browser may have limited WebGPU support' };
}




