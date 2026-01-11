// Frontend-facing shim for GPU metrics schema export interface GPUMetricEnhanced { timestamp?: number; fps?: number; memoryUsage?: number; gpuUtilization?: number; temperature?: number; powerUsage?: number; processingTimeMs?: number; sessionId?: string; gpuName?: string; vendor?: string; memoryMb?: number};
export type GPUMetrics = GPUMetricEnhanced;


