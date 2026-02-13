/**
 * Enhanced WebAssembly Type Definitions for GPU Integration
 */

// Enhanced import value type to handle GPU devices
export interface EnhancedImportValue {
	gpu?: GPUDevice;
	gl?: WebGLRenderingContext | WebGL2RenderingContext;
	memory?: WebAssembly.Memory;
}

// GPU device to ImportValue conversion utilities
export interface WebAssemblyGPUUtils {
	convertGPUDeviceToImportValue(device: GPUDevice): unknown;
	createImportsWithGPU(device: GPUDevice, additionalImports?: Record<string, unknown>): WebAssembly.Imports;
	assertGPUDevice(device: unknown): device is GPUDevice;
	convertAnalysisResult(analysis: unknown): Record<string, unknown>;
}

export declare const webAssemblyGPUUtils: WebAssemblyGPUUtils;