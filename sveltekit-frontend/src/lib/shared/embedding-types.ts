export interface QuantizedEmbedding {
	uint8: Uint8Array;
	data: Uint8Array;
	scale: number;
	offset: number;
	originalLength: number;
}

export interface EmbeddingResult {
	float32: Float32Array;
	quant: QuantizedEmbedding;
	quantized: QuantizedEmbedding;
	result?: any;
}



