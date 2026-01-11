import type { QuantizedEmbedding } from '$lib/shared/embedding-types';

export function quantizeFloat32ToUint8(float32: Float32Array): QuantizedEmbedding {
 // Find min/max for scaling
 let min = Infinity;
 let max = -Infinity;

 for (let i = 0; i < float32.length; i++) {
 const val = float32[i];
 if (val < min) min = val;
 if (val > max) max = val;
 }

 // Calculate scale and offset for 0-255 range
 const range = max - min;
 const scale = range === 0 ? 1 : 255 / range;
 const offset = min;

 // Quantize to Uint8Array
 const quantized = new Uint8Array(float32.length);
 for (let i = 0; i < float32.length; i++) {
 const scaled = (float32[i] - offset) * scale;
 quantized[i] = Math.max(0, Math.min(255, Math.round(scaled)));
 }

 return {
 data: quantized,
 scale,
 offset,
 originalLength: float32.length,
 };
}

export function dequantizeUint8ToFloat32(quant: QuantizedEmbedding): Float32Array {
 const float32 = new Float32Array(quant.originalLength);
 for (let i = 0; i < quant.originalLength; i++) {
 float32[i] = quant.data[i] / quant.scale + quant.offset;
 }
 return float32;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
 if (a.length !== b.length) {
 throw new Error('Vectors must have same length');
 }

 let dot = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dot += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 normA = Math.sqrt(normA);
 normB = Math.sqrt(normB);

 if (normA === 0 || normB === 0) return 0;

 return dot / (normA * normB);
}

export function quantizedCosineSimilarity(
 queryQuant: QuantizedEmbedding,
 docQuant: QuantizedEmbedding
): number {
 // Dequantize both vectors
 const queryFloat = dequantizeUint8ToFloat32(queryQuant);
 const docFloat = dequantizeUint8ToFloat32(docQuant);

 return cosineSimilarity(queryFloat, docFloat);
}
