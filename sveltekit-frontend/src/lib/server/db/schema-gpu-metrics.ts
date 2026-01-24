// Minimal shim for GPU metrics schema used by services during TypeScript checks. // This is a low-risk placeholder to unblock builds. Replace with the real schema // when database models are finalized. export type GPUMetricEnhanced = { id: string | timestamp, string | Date; gpuId?: string; utilizationPct?: number; memoryUsedMB?: number; memoryTotalMB?: number; temperatureC?: number; powerW?: number; custom?: { [key: string], any }}; export const GPUMetricEnhancedFields = [ 'id', 'timestamp', 'gpuId', 'utilizationPct', 'memoryUsedMB', 'memoryTotalMB', 'temperatureC', 'powerW']; // Replace invalid default export of a type with a runtime value export default GPUMetricEnhancedFields



