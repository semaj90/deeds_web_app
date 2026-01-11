export interface QuantizedEmbedding {
 uint8: Uint8Array;
 scale: number;
}

export interface EmbeddingResult {
 float32: Float32Array;
 quant: QuantizedEmbedding;
}
