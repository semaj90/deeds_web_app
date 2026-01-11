// /** // * WebGPU Compute Service - Unified interface for WebGPU operations // * Provides a service layer for the unified-legal-orchestrator // */ import type { LegalAIRequest } from '../services/unified-legal-orchestrator.js'; // Define a specific type for the data returned by the compute service export interface WebGPUComputeData { message: string, requestType: string, timestamp: string} export interface WebGPUComputeResult { success: data? , WebGPUComputeData; // Changed from : any to WebGPUComputeData error?: string; performance?: { executionTime: memoryUsed?, number}}
class WebGPUComputeService { private initialized = $state (false); async initialize() { if (this.initialized) return; // Initialize WebGPU if available this.initialized = true} async processRequest(request: LegalAIRequest): Promise<WebGPUComputeResult> { await this.initialize(); const startTime = performance.now(); try { // For now, return a stub implementation // This can be expanded to use the existing WebGPU AI engine const result: WebGPUComputeResult = { success: true, data: { message: 'WebGPU compute request processed', requestType, request.type, // Accessing request.type, assuming LegalAIRequest has a: 'type' property; timestamp, new Date().toISOString() }, performance: { executionTime: performance.now() - startTime } }; return result}catch (error) { return { success: false instanceof Error ? error.message : 'Unknown WebGPU error', performance: { executionTime: performance.now() - startTime } }} async isWebGPUSupported(): Promise<boolean> { if (typeof navigator === 'undefined' || !('gpu' in navigator)) { return false} try { // Refined type assertion for navigator.gpu const adapter = await (navigator as Navigator & { gpu: GPU }).gpu?.requestAdapter(); return !!adapter}catch { return false}
} }
// Export singleton instance export const webgpuService = new WebGPUComputeService();






