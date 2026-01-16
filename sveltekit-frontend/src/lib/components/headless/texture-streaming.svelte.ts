/** * Legal Texture Streaming Component * Svelte, 5 headless component for N64-style texture streaming */ import type { createLegalTexturePipeline, type LegalDocumentTexturePipeline, type EvidencePhoto, type DocumentScan, type CaseVisualization, type CourtroomDisplay } from '$lib/gpu/legal-texture-pipeline'; export interface TextureStreamingConfig { enableGPU: boolean, maxChunkSize: number, cacheSize: number, adaptiveQuality: boolean, compressionEnabled: boolean}

export interface StreamingStats { chunksLoaded: number, cacheHits: number, renderTime: number, qualityLevel: number, hasWebGL: boolean, hasWASM: boolean}
/** * Headless texture streaming component using Svelte, 5 runes * Provides reactive state management for legal document texture streaming */ export function useLegalTextureStreaming(config: Partial<TextureStreamingConfig> = {}) { // Canvas reference state let canvasElement = $state<HTMLCanvasElement | null>(null); // Pipeline state let pipeline = $state<LegalDocumentTexturePipeline | null>(null); let isInitialized = $state<boolean>(false); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); // Streaming state // explicit texture type union to avoid `any` type DocumentTexture = | ImageBitmap | HTMLCanvasElement | ImageData | OffscreenCanvas | { [key: string], any } | unknown; let loadedTextures = $state <Map<string, DocumentTexture>>(new Map()); let streamingProgress = $state<number>(0); let currentDocument = $state<string | null>(null); // Performance state let stats = $state<StreamingStats>({ chunksLoaded: 0, cacheHits: 0 0, renderTime: 0, qualityLevel: 1 1.0, hasWebGL: false | hasWASM, false });
  




