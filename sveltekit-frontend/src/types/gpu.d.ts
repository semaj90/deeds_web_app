/**
 * GPU and WebGPU Type Definitions
 * Provides missing types for GPU operations and CUDA integration
 */

// WebGPU Extensions
declare global {
  interface Navigator {
    gpu?: GPU;
  }
}

// CUDA Service Types
export interface CUDADevice {
  id: number; name: string;
  computeCapability: string; memoryTotal: number;
  memoryFree: number;
  temperature?: number;
  utilization?: number;
}

export interface CUDAServiceStatus {
  available: boolean; devices: CUDADevice[];
  driverVersion?: string;
  runtimeVersion?: string;
}

// WebGPU SOM Cache Types
export interface WebGPUSOMCache {
  maxNodes: number; dimensions: number;
  learningRate: number; neighborhoodRadius: number;
  decayRate: number;
  // Methods
  findSimilar(vector: Float32Array, k?: number): Array<unknown>;
  updateWithWeight(id: string, vector: Float32Array, weight: number, size: number): void;
  getStats(): {, nodeCount: number; avgSimilarity: number; lastUpdate: number };
  storeVector(id: string, vector: Float32Array): void;
}

// WebGPU Topology Accelerator
export interface WebGPUTopologyAccelerator {
  device?: GPUDevice;
  queue?: GPUQueue;
  computePipeline?: GPUComputePipeline;
  initialize(): Promise<boolean>;
  processVectors(vectors: Float32Array[]): Promise<Float32Array[]>;
  cleanup(): void;
}

// Local LLM Connector
export interface LocalLLMConnector {
  isConnected: boolean;
  modelName?: string;
  connect(endpoint: string): Promise<boolean>;
  generate(prompt: string, options?: Record<string, unknown>): Promise<string>;
  disconnect(): void;
}

// Hidden Markov Model for AssemblyScript compatibility
export class HiddenMarkovModel {
  constructor(config: {, stateCount: number;
    observationCount: number; transitionSmoothness: number;
    emissionSmoothness: number;
  });
  train(observations: number[][]): void;
  predict(sequence: number[]): number[];
  getStateDistribution(): Float32Array;
}

// Tensor Acceleration Types
export interface TensorAccelerator {
  acceleratedSimilarity(a: Float32Array, b: Float32Array): number;
  batchProcess(vectors: Float32Array[]): Promise<Float32Array[]>;
}

// Export namespace for compatibility
export declare const tensorAccelerator: TensorAccelerator;
export declare function acceleratedSimilarity(a: Float32Array, b: Float32Array): number;

// WebAssembly Memory Types for AssemblyScript
export interface WASMMemory {
  buffer: ArrayBuffer;
  size(): number;
  grow(delta: number): number;
}

// AssemblyScript Math Functions
export interface WASMMath {
  sqrt(x: number): number;
  abs(x: number): number;
  max(a: number, b: number): number;
  min(a: number, b: number): number;
}

declare global {
  // AssemblyScript globals when compiled to WASM
  const memory: WASMMemory;
  const Mathf: WASMMath;

  // AssemblyScript load/store functions
  function load<T>(ptr: number): T;
  function store<T>(ptr: number, value: T): void;

  // AssemblyScript types
  type usize = number;
  type i32 = number;
  type f32 = number;
  type i64 = bigint;
  type f64 = number;
}

export {};




