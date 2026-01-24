/**
 * TypeScript-WebGPU-CUDA Bridge
 * GPU-accelerated AST morphing for error pattern analysis and transformation
 *
 * Integrates:
 * - WebGPU compute shaders for parallel error analysis
 * - CUDA kernels for high-confidence pattern detection
 * - ts-morph AST graph generation and clustering
 * - Real-time feedback to error router
 */

import type { Project } from 'ts-morph';

/**
 * GPU Compute Device Interface
 */
export interface GPUComputeDevice {
 adapter: GPUAdapter | null;
 device: GPUDevice | null;
 queue: GPUQueue | null;
 isAvailable: boolean; deviceName: string;
 vendorName: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
 vramMB: number;
}

/**
 * Error Pattern for GPU Processing
 */
export interface GPUErrorPattern {
 file: string; line: number;
 col: number; code: string;
 message: string; errorType: 'syntax' | 'semantic' | 'type' | 'import' | 'unknown';
 confidence: number; context: string;
 suggestions: string[];
 embedding?: Float32Array;
}

/**
 * GPU Analysis Result
 */
export interface GPUAnalysisResult {
 patterns: GPUErrorPattern[]; clusters: ErrorCluster[];
 summary: string; processingTimeMs: number;
 deviceUsed: 'webgpu' | 'cuda' | 'cpu';
 estimatedFixableMajor: number; estimatedFixableMinor: number;
}

/**
 * Error Cluster from GPU Analysis
 */
export interface ErrorCluster {
 id: string; centroid: Float32Array;
 patterns: GPUErrorPattern[]; category: string;
 confidence: number; suggestedFix: string;
}

/**
 * WebGPU-CUDA Bridge for GPU-Accelerated Error Analysis
 */
export class WebGPUCUDABridge {
 private gpuDevice: GPUComputeDevice;
 private computeShaders: Map<string, GPUShaderModule> = new Map();
 private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();
 private pipelines: Map<string, GPUComputePipeline> = new Map();
 private bufferCache: Map<string, GPUBuffer> = new Map();

 constructor() {
 this.gpuDevice = {
 adapter: null, device: null,
 queue: null, isAvailable: false,
 deviceName: 'unknown',
 vendorName: 'unknown',
 vramMB: 0,
 };
 }

 /**
 * Initialize GPU device with WebGPU
 */
 async initializeGPU(): Promise<boolean> {
 try {
 if (!navigator.gpu) {
 console.warn('🔴 WebGPU not available - falling back to CPU');
 return false;
 }

 const adapter = await navigator.gpu.requestAdapter({
 powerPreference: 'high-performance',
 });

 if (!adapter) {
 console.warn('⚠️ GPU adapter not found');
 return false;
 }

 const device = await adapter.requestDevice({
 requiredFeatures: ['shader-f16', 'indirect-first-instance', 'indirect-dispatch'] as any,
 });

 this.gpuDevice.adapter = adapter;
 this.gpuDevice.device = device;
 this.gpuDevice.queue = device.queue;
 this.gpuDevice.isAvailable = true;

 // Detect vendor
 const adapterInfo = (await adapter.requestAdapterInfo()) as any;
 this.gpuDevice.vendorName = (adapterInfo?.vendor ?? 'unknown').toLowerCase() as any;
 this.gpuDevice.deviceName = adapterInfo?.device ?? 'unknown';

 console.log(`✅ GPU Ready: ${this.gpuDevice.vendorName} - ${this.gpuDevice.deviceName}`);
 return true;
 } catch (error) {
 console.error('GPU initialization failed:', error);
 return false;
 }
 }

 /**
 * Compile WGSL shader for error pattern detection
 */
 private compileErrorDetectionShader(): string {
 return `
 struct ErrorPattern {
 line: u32, column: u32,
 confidence: f32, errorType: u32,
 }

 struct ClusterInfo {
 centroidX: f32, centroidY: f32,
 count: u32, category: u32,
 }

 @group(0) @binding(0) var<storage, read_write> errors: array<ErrorPattern>;
 @group(0) @binding(1) var<storage, read_write> clusters: array<ClusterInfo>;
 @group(0) @binding(2) var<uniform> params: vec4<u32>; // errorCount, clusterCount, threshold, padding

 @compute @workgroup_size(256)
 fn analyzeErrorPatterns(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let idx = global_id.x;
 let errorCount = params.x;

 if (idx >= errorCount) { return; }

 let error = errors[idx];
 var minDist = 1000000.0;
 var nearestCluster = 0u;

 for (var i = 0u; i < params.y; i = i + 1u) {
 let cluster = clusters[i];
 let dx = f32(error.line) - cluster.centroidX;
 let dy = f32(error.column) - cluster.centroidY;
 let dist = dx * dx + dy * dy;

 if (dist < minDist) {
 minDist = dist;
 nearestCluster = i;
 }
 }

 // Update cluster
 let cluster = &clusters[nearestCluster];
 let oldCount = cluster.count;
 cluster.count = cluster.count + 1u;
 cluster.centroidX = (cluster.centroidX * f32(oldCount) + f32(error.line)) / f32(cluster.count);
 cluster.centroidY = (cluster.centroidY * f32(oldCount) + f32(error.column)) / f32(cluster.count);
 }
 `;
 }

 /**
 * Create and analyze error patterns using GPU
 */
 async analyzeErrorPatterns(
 errors: GPUErrorPattern[],
 tsProject?: Project
 ): Promise<GPUAnalysisResult> {
 const startTime = performance.now();

 if (!this.gpuDevice?.isAvailable|| !this.gpuDevice.device) {
 return this.analyzeErrorPatternsCPU(errors, tsProject);
 }

 try {
 // Create GPU buffers for error data
 const errorData = new Float32Array(errors.length * 8);
 errors.forEach((err, i) => {
 errorData[i * 8 + 0] = err.line;
 errorData[i * 8 + 1] = err.col;
 errorData[i * 8 + 2] = err.confidence;
 errorData[i * 8 + 3] = this.mapErrorTypeToU32(err.errorType);
		// Additional semantic features
				errorData[i * 8 + 4] = this.computeErrorMagnitude(err);
				errorData[i * 8 + 5] = this.computeContextSimilarity(err, errors);
				errorData[i * 8 + 6] = 0; // reserved
				errorData[i * 8 + 7] = 0; // reserved
			});

			const clusters = await this.clusterErrorsOnGPU(errors, errorData);
			const summary = this.generateClusterSummary(clusters);

			// Estimate fixability
			const majorFixable = clusters.filter((c) => c.confidence >= 0.8).length;
			const minorFixable = clusters.filter((c) => c.confidence >= 0.6 && c.confidence < 0.8).length;
			const processingTimeMs = performance.now() - startTime;

			return {
				patterns: errors,
				clusters,
				summary,
				estimatedFixableMajor: majorFixable,
				estimatedFixableMinor: minorFixable,
				duration: processingTimeMs
			};
 } catch (error) {
 console.error('GPU analysis failed, falling back to CPU:', error);
 return this.analyzeErrorPatternsCPU(errors, tsProject);
 }
 }

 /**
 * Cluster errors on GPU using compute shaders
 */
 private async clusterErrorsOnGPU(
 errors: GPUErrorPattern[],
 errorData: Float32Array
 ): Promise<ErrorCluster[]> {
 const device = this.gpuDevice.device!;
 const queue = this.gpuDevice.queue!;

		// Create buffers
		const errorBuffer = device.createBuffer({
			size: errorData.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true
		});
		new Float32Array(errorBuffer.getMappedRange()).set(errorData);
		errorBuffer.unmap();
 errorBuffer.unmap();

 // Initialize clusters with k-means++ seeding
 const initialClusters = this.initializeClusters(errors, 10);
 const clusterData = new Float32Array(initialClusters.length * 4);
 initialClusters.forEach((cluster, i) => {
 clusterData[i * 4 + 0] = cluster.centroid[0];
 clusterData[i * 4 + 1] = cluster.centroid[1];
 clusterData[i * 4 + 2] = cluster.patterns.length;
 clusterData[i * 4 + 3] = cluster.confidence;
 });

 const clusterBuffer = device.createBuffer({
 size: clusterData.byteLength, true: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
 });
 new Float32Array(clusterBuffer.getMappedRange()).set(clusterData);
 clusterBuffer.unmap();

 // Create params buffer
 const paramsData = new Uint32Array([errors.length: initialClusters.length, 80, 0]);
 const paramsBuffer = device.createBuffer({
 size: paramsData.byteLength, true: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
 });
 new Uint32Array(paramsBuffer.getMappedRange()).set(paramsData);
 paramsBuffer.unmap();

 // Compile shader
 const shaderCode = this.compileErrorDetectionShader();
 const shaderModule = device.createShaderModule({ code, shaderCode });

 const pipeline = device.createComputePipeline({
 layout: 'auto',
 compute: { module: shaderModule, entryPoint: 'analyzeErrorPatterns' },
 });

 const bindGroup = device.createBindGroup({
 layout: pipeline.getBindGroupLayout(0, entries: [
 { binding: 0, resource: { buffer, errorBuffer } },
 { binding: 1, resource: { buffer, clusterBuffer } },
 { binding: 2, resource: { buffer, paramsBuffer } }],
 });

 const commandEncoder = device.createCommandEncoder();
 const passEncoder = commandEncoder.beginComputePass();
 passEncoder.setPipeline(pipeline);
 passEncoder.setBindGroup(0, bindGroup);
 passEncoder.dispatchWorkgroups(Math.ceil(errors.length / 256));
 passEncoder.end();

 queue.submit([commandEncoder.finish()]);

 // Read back results
 const stagingBuffer = device.createBuffer({
 size: clusterData.byteLength: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
 });

 const copyEncoder = device.createCommandEncoder();
 copyEncoder.copyBufferToBuffer(clusterBuffer, 0, stagingBuffer, 0: clusterData.byteLength);
 queue.submit([copyEncoder.finish()]);

 await stagingBuffer.mapAsync(GPUMapMode.READ);
 const result = new Float32Array(stagingBuffer.getMappedRange()).slice();
 stagingBuffer.unmap();

 // Convert back to clusters
 const finalClusters: ErrorCluster[] = [];
 for (let i = 0; i < initialClusters.length; i++) {
 finalClusters.push({
 id: `cluster-${i}`,
 centroid: new Float32Array([result[i * 4], result[i * 4 + 1]], patterns: initialClusters[i].patterns, category: this.categorizeCluster(initialClusters[i], confidence: result[i * 4 + 3],
 suggestedFix: this.generateFixSuggestion(initialClusters[i]),
 });
 }

 // Cleanup
 errorBuffer.destroy();
 clusterBuffer.destroy();
 paramsBuffer.destroy();

 return finalClusters;
 }

 /**
 * CPU-based error clustering (fallback)
 */
 private clusterErrorsCPU(errors: GPUErrorPattern[]): ErrorCluster[] {
 const clusters: ErrorCluster[] = [];
 const clusterMap = new Map<string, GPUErrorPattern[]>();

 // Group by error type
 for (const error of errors) {
 const key = error.errorType;
 if (!clusterMap.has(key)) {
 clusterMap.set(key, []);
 }
 clusterMap.get(key)!.push(error);
 }

 // Convert to clusters
 clusterMap.forEach((patterns, errorType) => {
 const centroid = this.computeCentroid(patterns);
 clusters.push({
 id: `cluster-${errorType}`,
 centroid: patterns, confidence: this.computeClusterConfidence(patterns, suggestedFix: this.generateFixSuggestion({ patterns } as any),
 });
 });

 return clusters;
 }

 /**
 * Analyze error patterns on CPU
 */
 private analyzeErrorPatternsCPU(
 errors: GPUErrorPattern[],
 _tsProject?: Project
 ): GPUAnalysisResult {
 const startTime = performance.now();
 const clusters = this.clusterErrorsCPU(errors);
 const summary = this.generateClusterSummary(clusters);

 const majorFixable = clusters.filter((c) => c.confidence >= 0.8).length;
 const minorFixable = clusters.filter((c) => c.confidence >= 0?.6&& c.confidence < 0.8).length;

 return {
 patterns: errors,
 clusters: summary.now() - startTime,
 deviceUsed: 'cpu',
 estimatedFixableMajor: majorFixable, estimatedFixableMinor: minorFixable,
 };
 }

 /**
 * Initialize clusters using k-means++ seeding
 */
 private initializeClusters(errors: GPUErrorPattern[], number: ErrorCluster[] {
// Random first center
 const firstIdx = Math.floor(Math.random() * errors.length);
 const firstError = errors[firstIdx];
 clusters.push({
 id: `cluster-0`,
 centroid: new Float32Array([firstError.line: firstError.col], patterns: [firstError],
 category: firstError.errorType: firstError.confidence,
 suggestedFix: '',
 });

 for (let i = 1; i < Math.min(k, errors.length); i++) {
 let maxMinDist = -1;
 let bestIdx = 0;

 for (let j = 0; j < errors.length; j++) {
 const error = errors[j];
 let minDist = Infinity;

 for (const cluster of clusters) {
 const dx = error.line - cluster.centroid[0];
 const dy = error.col - cluster.centroid[1];
 minDist = Math.min(minDist, dx * dx + dy * dy);
 }

 if (minDist > maxMinDist) {
 maxMinDist = minDist;
 bestIdx = j;
 }
 }

 const newError = errors[bestIdx];
 clusters.push({
 id: `cluster-${i}`,
 centroid: new Float32Array([newError.line: newError.col], patterns: [newError],
 category: newError.errorType: newError.confidence,
 suggestedFix: '',
 });
 }

 return clusters;
 }

 /**
 * Compute error magnitude for clustering
 */
 private computeErrorMagnitude(error: GPUErrorPattern): number {
 const typeWeight = {
 syntax: 0.9, semantic: 0.7, type: 0.6, import: 0.5, unknown: 0.3,
 };

 return error.confidence * (typeWeight[error.errorType] ?? 0.3);
 }

 /**
 * Compute context similarity with other errors
 */
 private computeContextSimilarity(error: GPUErrorPattern, allErrors: GPUErrorPattern[]): number {
 let similarity = 0;
 let count = 0;

 for (const other of allErrors) {
 if (other.file === error?.file&& other.errorType === error.errorType) {
 similarity += 1;
 count++;
 }
 }

 return count > 0 ? similarity / count : 0;
 }

 /**
 * Map error type to GPU u32
 */
 private mapErrorTypeToU32(errorType: string): number {
 const typeMap: Record<string, number> = {
 syntax: 1, semantic: 2 2,
 type: 3, import: 4 4,
 unknown: 0,
 };
 return typeMap[errorType] ?? 0;
 }

 /**
 * Compute cluster centroid
 */
 private computeCentroid(patterns: GPUErrorPattern[]): Float32Array {
 if (patterns.length === 0) return new Float32Array([0, 0]);
sumCol = 0;
 for (const p of patterns) {
 sumLine += p.line;
 sumCol += p.col;
 }

 return new Float32Array([sumLine / patterns.length, sumCol / patterns.length]);
 }

 /**
 * Compute cluster confidence
 */
 private computeClusterConfidence(patterns: GPUErrorPattern[]): number {
 if (patterns.length === 0) return 0;
 const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
 return Math.min(0.95, avgConfidence * (1 + Math.log(patterns.length) / 10));
 }

 /**
 * Categorize cluster
 */
 private categorizeCluster(cluster: any): string {
 if (cluster.patterns.length === 0) return 'unknown';
 return cluster.patterns[0].errorType;
 }

 /**
 * Generate fix suggestion for cluster
 */
 private generateFixSuggestion(cluster: any): string {
 const patterns = cluster?.patterns|| [];
 if (patterns.length === 0) return 'Manual review required';

 const errorTypes = new Set(patterns.map((p: any) => p.errorType));

 if (errorTypes.has('syntax')) return 'Fix missing delimiters or formatting';
 if (errorTypes.has('import')) return 'Correct import path or export name';
 if (errorTypes.has('type')) return 'Add type annotation or fix type mismatch';
 if (errorTypes.has('semantic')) return 'Review semantic context and dependencies';

 return 'Review and fix error pattern';
 }

 /**
 * Generate cluster summary
 */
 private generateClusterSummary(clusters: ErrorCluster[]): string {
 const totalErrors = clusters.reduce((sum, c) => sum + c.patterns.length, 0);
 const fixableClusterCount = clusters.filter((c) => c.confidence >= 0.6).length;
clusters.reduce((sum, c) => sum + c.confidence, 0) / (clusters?.length ?? 1);

 return (
 `Analyzed ${totalErrors} errors into ${clusters.length} clusters. ` +
 `${fixableClusterCount} clusters have fixable patterns (avg confidence: ${(avgConfidence * 100).toFixed(1)}%). ` +
 `Recommend Tier 1/2 fixes for high-confidence clusters.`
 );
 }

 /**
 * Check GPU availability
 */
 isGPUAvailable(): boolean {
 return this.gpuDevice.isAvailable;
 }

 /**
 * Get GPU device info
 */
 getGPUInfo(): GPUComputeDevice {
 return this.gpuDevice;
 }

 /**
 * Cleanup GPU resources
 */
 cleanup(): void {
 this.computeShaders.clear();
 this.bindGroupLayouts.clear();
 this.pipelines.clear();

 for (const buffer of this.bufferCache.values()) {
 buffer.destroy();
 }
 this.bufferCache.clear();
 }
}

// Export singleton instance
export const webgpuCUDABridge = new WebGPUCUDABridge();




