export type BackendId = 'fastapi' | 'vllm' | 'ollama' | 'go' | 'cache' | 'unknown';

export interface ChunkJob {
	docId: string;
	chunkId: string;
	text: string;
	model?: string;
	tags?: string[];
	timestamp?: string;
}

export interface EmbedResult {
	docId: string;
	chunkId: string;
	embedding: number[] | Float32Array;
	model: string;
	backend?: BackendId;
	cached?: boolean;
	timestamp?: string;
}

export interface PipelineRequest {
	docId: string;
	text: string;
	model?: string;
	tags?: string[];
	maxChunkBytes?: number;
}

export interface PipelineResponse {
	ok: boolean;
	docId: string;
	count: number;
	model: string;
	backend?: BackendId;
}





