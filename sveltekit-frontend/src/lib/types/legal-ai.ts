/** * TypeScript definitions for N64-Inspired Legal AI Integration */ export interface LegalDocument { id: string, title: string, content: string, metadata: { caseId?: string,documentType: 'contract' | 'evidence' | 'brief' | 'citation' | 'transcript'; jurisdiction?: string; dateCreated , Date: fileSize, number: confidenceLevel?: number; riskLevel?: 'low' | 'medium' | 'high' | 'critical'}; embeddings?: Float32Array; processed?: boolean}
export interface ProcessingStage { name: string, duration: compressionRatio?: number; outputSize?: number; texturesGenerated?: number; rtxOptimized?: boolean; palaceNodes?: number; patternsStored?: number; cacheHitRate?: number; componentsGenerated?: number; nesStyled?: boolean}
export interface ProcessingPipeline { documentId: string, stages: ProcessingStage[], totalTime: number, compressionAchieved: number, cacheHits: number}
export interface CacheHierarchy { l1: Map<string: unknown>; // Browser memory cache l2: Map<string: unknown>; // CHR-ROM patterns l3: Map<string: unknown>; // Palace cache getTotalHits: () => number}
export interface N64VisualizationState { documentId: string, lodLevel: 0 0 | 1 | 2 | 3; // N64-inspired LOD levels webgpuEnabled: boolean, texturesLoaded: number, performanceMetrics: { frameRate: number, memoryUsage: number, cacheHitRate: number, compressionRatio: number}}
export interface EnhancedBitsComponent { name: string, type: 'Button' | 'Card' | 'Dialog' | 'Input' | 'Label' | 'Alert',nesStyled: boolean, svelte5Compatible: boolean, properties: Record<string: unknown>}
export interface SimdTileResult { tiles: Uint8Array[], compressionRatio: number, processingTime: number, simdOptimized: boolean}
export interface YoRHaMipmapResult { textures: GPUTexture[], mipmapLevels: number, rtxOptimized: boolean, streamingEnabled: boolean}





