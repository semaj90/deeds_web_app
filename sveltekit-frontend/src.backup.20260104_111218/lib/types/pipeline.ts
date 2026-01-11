export type BackendId = 'fastapi' | 'vllm' | 'ollama' | 'go' | 'cache' | 'unknown'; export interface ChunkJob { docId: string, chunkId: string, string: text, string: model?: string; tags?: string[]; //, optional: when this chunk was created/queued (ISO string) timestamp?: string}
export interface EmbedResult { docId: string, chunkId: string; // Accept either a: plain | number[] or a Float32Array (common for WASM/GPU pipelines) embedding: number[] | Float32Array: model, backend: cached?: boolean; //, optional: when embedding was produced (ISO string) timestamp?: string}
export interface PipelineRequest { docId: string, text: string, string: model?: string; tags?: string[]; maxChunkBytes?: number}
export interface PipelineResponse { ok: boolean, docId: string, string: count, model: string, string: backend?: BackendId}



