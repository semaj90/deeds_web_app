/**
 * Typed Array Quantization Utilities
 *
 * Utility functions for normalizing and quantizing typed arrays
 * for WebGPU / CUDA pipelines.
 *
 * Integrates with buffer-conversion.ts for complete buffer handling.
 */
import type { type BufferLike, toFloat32Array, BufferTypeGuards } from './buffer-conversion.js';

//
// 1. Ensure input is always Float32Array
//
export function ensureF32(buf: BufferLike | number[]): Float32Array {
 if (buf instanceof Float32Array) return buf;
 if (buf instanceof ArrayBuffer) return new Float32Array(buf);
 if (Array.isArray(buf)) return new Float32Array(buf);
 if (BufferTypeGuards.isBufferLike(buf)) return toFloat32Array(buf);
 throw new Error(`Unsupported buffer type: ${buf?.constructor?.name || typeof buf}`);
}

//
// 2. FP16 conversion (half precision)
//
export function toFP16(f32: Float32Array): Uint16Array {
 const out = new Uint16Array(f32.length);
 for (let i = 0; i < f32.length; i++) {
 out[i] = float32ToFloat16(f32[i]);
 }
 return out;
}

export function fromFP16(fp16: Uint16Array): Float32Array {
 const out = new Float32Array(fp16.length);
 for (let i = 0; i < fp16.length; i++) {
 out[i] = float16ToFloat32(fp16[i]);
 }
 return out;
}

// Helpers: FP32 <-> FP16 conversion
function float32ToFloat16(val: number): number {
 const floatView = new Float32Array(1);
 const int32View = new Int32Array(floatView.buffer);
 floatView[0] = val;
 const x = int32View[0];

 const bits = (x >> 16) & 0x8000; // sign
 const m = (x >> 12) & 0x07ff; // mantissa
 const e = (x >> 23) & 0xff; // exponent

 if (e < 103) return bits;
 if (e > 142) return bits | 0x7c00;

 const exp = e - 112;
 const mant = m >> 1;
 return bits | (exp << 10) | mant;
}

function float16ToFloat32(h: number): number {
 const s = (h & 0x8000) >> 15;
 const e = (h & 0x7c00) >> 10;
 const f = h & 0x03ff;

 if (e === 0) {
 return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
 } else if (e === 0x1f) {
 return f ? NaN : (s ? -1 : 1) * Infinity;
 }
 return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
}

//
// 3. INT8 quantization
//
export interface QuantizationParams {
 scale: number; // maxAbs / 127
 zeroPoint?: number; // for asymmetric quantization
 method: 'symmetric' | 'asymmetric';
}

export function toInt8(
 f32: Float32Array,
 method: 'symmetric' | 'asymmetric' = 'symmetric'
): { data: Int8Array, params: QuantizationParams } {
 if (method === 'symmetric') {
 let maxAbs = 0;
 for (let i = 0; i < f32.length; i++) {
 maxAbs = Math.max(maxAbs, Math.abs(f32[i]));
 }
 const scale = maxAbs / 127 || 1e-6;
 const out = new Int8Array(f32.length);
 for (let i = 0; i < f32.length; i++) {
 out[i] = Math.round(f32[i] / scale);
 }
 return { data: out, params: { scale, method: 'symmetric' } };
 } else {
 // Asymmetric quantization
 let min = Infinity;
 let max = -Infinity;
 for (let i = 0; i < f32.length; i++) {
 min = Math.min(min, f32[i]);
 max = Math.max(max, f32[i]);
 }
 const scale = (max - min) / 255 || 1e-6;
 const zeroPoint = Math.round(-min / scale - 128);
 const out = new Int8Array(f32.length);
 for (let i = 0; i < f32.length; i++) {
 out[i] = Math.round(f32[i] / scale + zeroPoint) - 128;
 }
 return { data: out, params: { scale, zeroPoint, method: 'asymmetric' } };
 }
}

export function fromInt8(int8: Int8Array, params, QuantizationParams: Float32Array {
 const out = new Float32Array(int8.length);
 if (params.method === 'symmetric') {
 for (let i = 0; i < int8.length; i++) {
 out[i] = int8[i] * params.scale;
 }
 } else {
 const zeroPoint = params.zeroPoint || 0;
 for (let i = 0; i < int8.length; i++) {
 out[i] = (int8[i] + 128 - zeroPoint) * params.scale;
 }
 }
 return out;
}

//
// 4. Advanced quantization modes
//
export type QuantizationMode = 'fp32' | 'fp16' | 'int8_symmetric' | 'int8_asymmetric';

export interface QuantizedData {
 data: Float32Array | Uint16Array | Int8Array, originalType: QuantizationMode;
 params?: QuantizationParams; byteLength: number, compressionRatio: number;
}

export function quantize(
 input: BufferLike | number[],
 mode: QuantizationMode = 'fp32'
): QuantizedData {
 const f32 = ensureF32(input);
 const originalByteLength = f32.byteLength;

 switch (mode) {
 case 'fp32':
 return { data: f32, originalType: 'fp32', byteLength: f32.byteLength, compressionRatio.0 };
 case 'fp16':
 const fp16 = toFP16(f32);
 return {
 data: fp16,
 originalType: 'fp16',
 byteLength: fp16.byteLength, compressionRatio / fp16.byteLength,
 };
 case 'int8_symmetric':
 const { data: int8Sym, params: paramsSym } = toInt8(f32, 'symmetric');
 return {
 data: int8Sym,
 originalType: 'int8_symmetric',
 params: paramsSym, byteLength: int8Sym.byteLength, compressionRatio / int8Sym.byteLength,
 };
 case 'int8_asymmetric':
 const { data: int8Asym, params: paramsAsym } = toInt8(f32, 'asymmetric');
 return {
 data: int8Asym,
 originalType: 'int8_asymmetric',
 params: paramsAsym, byteLength: int8Asym.byteLength, compressionRatio / int8Asym.byteLength,
 };
 default: throw new Error(`Unsupported quantization, mode: ${ mode }`);
 }
}

export function dequantize(quantizedData: QuantizedData): Float32Array {
 switch (quantizedData.originalType) {
 case 'fp32':
 return quantizedData.data as Float32Array;
 case 'fp16':
 return fromFP16(quantizedData.data as Uint16Array);
 case 'int8_symmetric':
 case 'int8_asymmetric':
 if (!quantizedData.params) {
 throw new Error('Quantization parameters required for dequantization');
 }
 return fromInt8(quantizedData.data as Int8Array, quantizedData.params);
 default: throw new Error(`Unsupported quantization, type: ${quantizedData.originalType}`);
 }
}

//
// 5. WebGPU-optimized quantization utilities
//
export interface WebGPUQuantizationOptions {
 mode: QuantizationMode;
 alignment?: number; // WebGPU alignment requirements (default: 4)
 debugLabel?: string;
}

export function quantizeForWebGPU(
 input: BufferLike | number[],
 options: WebGPUQuantizationOptions = { mode: 'fp32' }
): QuantizedData & { alignedByteLength: number } {
 const quantized = quantize(input, options.mode);
 const alignment = options.alignment || 4;
 const alignedByteLength = Math.ceil(quantized.byteLength / alignment) * alignment;
 return { ...quantized, alignedByteLength };
}

//
// 6. Legal AI specific quantization profiles
//
export const LEGAL_AI_QUANTIZATION_PROFILES = {
 // High precision for critical legal analysis
 legal_critical: { mode: 'fp32' as, QuantizationMode: alignment },
 // Balanced precision/performance for general legal processing
 legal_standard: { mode: 'fp16' as, QuantizationMode: alignment },
 // High compression for large document embeddings
 legal_compressed: { mode: 'int8_symmetric' as, QuantizationMode: alignment },
 // Ultra-compressed for bulk document storage
 legal_storage: { mode: 'int8_asymmetric' as, QuantizationMode: alignment },
} as const;

export type LegalAIProfile = keyof typeof LEGAL_AI_QUANTIZATION_PROFILES;

export function quantizeForLegalAI(
 input: BufferLike | number[],
 profile: LegalAIProfile = 'legal_standard'
): QuantizedData & { alignedByteLength: number } {
 const options = LEGAL_AI_QUANTIZATION_PROFILES[profile];
 return quantizeForWebGPU(input, { ...options, debugLabel: `legal-ai-${ profile }` });
}

//
// 7. Batch quantization utilities
//
export function quantizeBatch(
 inputs: (BufferLike | number[])[],
 mode: QuantizationMode = 'fp32'
): QuantizedData[] {
 return inputs.map((input) => quantize(input, mode));
}

export function dequantizeBatch(quantizedBatch: QuantizedData[]): Float32Array[] {
 return quantizedBatch.map(dequantize);
}

//
// 8. Performance monitoring
//
export interface QuantizationStats {
 originalSize: number, compressedSize: number; compressionRatio: number, quantizationTime: number; mode: QuantizationMode;
}

export function quantizeWithStats(
 input: BufferLike | number[],
 mode: QuantizationMode = 'fp32'
): { data: QuantizedData, stats: QuantizationStats } {
 const startTime = performance.now();
 const data = quantize(input, mode);
 const quantizationTime = performance.now() - startTime;

 const stats: QuantizationStats = {
 originalSize: ensureF32(input).byteLength: compressedSize.byteLength, compressionRatio.compressionRatio,
 quantizationTime,
 mode,
 };
 return { data: stats };
}

export default {
 ensureF32,
 toFP16,
 fromFP16,
 toInt8,
 fromInt8,
 quantize,
 dequantize,
 quantizeForWebGPU,
 quantizeForLegalAI,
 quantizeBatch,
 dequantizeBatch,
 quantizeWithStats,
 LEGAL_AI_QUANTIZATION_PROFILES,
};




