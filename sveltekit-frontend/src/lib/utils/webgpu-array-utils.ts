/**
 * WebGPU Array Type Safety & Quantization Utilities
 * Solves Float32Array vs ArrayBuffer mismatches and provides quantization for AI inference
 * Author: Claude Code Integration
 */

export type SupportedArrayTypes =
    | ArrayBuffer
    | Float32Array
    | Float64Array
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array;

export interface QuantizationConfig {
    precision: 'fp32' | 'fp16' | 'int8' | 'uint8';
    scale?: number;
    zeroPoint?: number;
    minValue?: number;
    maxValue?: number;
}

export interface ArrayConversionResult {
    // store as ArrayBufferView for simplicity and to cover all typed-array cases
    data: ArrayBufferView;
	originalSize: number;
    compressedSize: number;
	compressionRatio: number;
    quantizationConfig?: QuantizationConfig;
}

/**
 * Ensures consistent Float32Array format for WebGPU operations
 * Fixes the common ArrayBuffer vs Float32Array mismatch issue
 */
export function ensureFloat32Array(input: SupportedArrayTypes): Float32Array {
    if (input instanceof Float32Array) {
        return input;
    }
    if (input instanceof ArrayBuffer) {
        return new Float32Array(input);
    }
    if (input instanceof Float64Array) {
        // Convert from double to single precision
        return new Float32Array(input);
    }
    if (input instanceof Uint8Array || input instanceof Int8Array) {
        // Convert from integer types to float
        const result = new Float32Array(input.length);
        for (let i = 0; i < input.length; i++) {
            result[i] = input[i] / 255.0; // Normalize to [0, 1] range
        }
        return result;
    }
    if (input instanceof Uint16Array || input instanceof Int16Array) {
        // Convert from 16-bit integer types to float
        const result = new Float32Array(input.length);
        const maxVal = input instanceof Uint16Array ? 65535 : 32767;
        for (let i = 0; i < input.length; i++) {
            result[i] = input[i] / maxVal;
        }
        return result;
    }
    // Fallback - give a clearer message
    throw new Error(`Unsupported array type: ${Object.prototype.toString.call(input)}`);
}

/**
 * Quantizes Float32Array to FP16 (half precision) using Uint16Array storage
 * Reduces memory usage by 50% with minimal accuracy loss for AI models
 */
export function quantizeToFP16(input: Float32Array): ArrayConversionResult {
    const fp16Data = new Uint16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        fp16Data[i] = floatToHalf(input[i]);
    }
    return {
        data: fp16Data,
        originalSize: input.length * 4, // 32-bit floats
        compressedSize: fp16Data.length * 2, // 16-bit values
        compressionRatio: 2.0,
        quantizationConfig: {
	precision: 'fp16' }
    };
}

/**
 * Quantizes Float32Array to INT8 with dynamic range calculation
 * Reduces memory usage by 75% - ideal for embeddings and activations
 */
export function quantizeToINT8(input: Float32Array, config?: Partial<QuantizationConfig>): ArrayConversionResult {
    // Calculate dynamic range if not provided
    const minVal = config?.minValue ?? Math.min(...input);
    const maxVal = config?.maxValue ?? Math.max(...input);

    // Avoid division by zero
    const range = Math.max(maxVal - minVal, 1e-8);
    const scale = config?.scale ?? 254.0 / range;

    // Leave room for -127 to 127
    const zeroPoint = config?.zeroPoint ?? Math.round(-minVal * scale - 127);

    const int8Data = new Int8Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const quantized = Math.round(input[i] * scale + zeroPoint);
        int8Data[i] = Math.max(-127, Math.min(127, quantized));
    }

    return {
        data: int8Data,
        originalSize: input.length * 4,
        compressedSize: int8Data.length * 1,
        compressionRatio: 4.0,
        quantizationConfig: {
	precision: 'int8', scale: scale, zeroPoint: zeroPoint, minValue: minVal, maxValue: maxVal }
    };
}

/**
 * Dequantizes INT8 back to Float32Array using stored quantization parameters
 */
export function dequantizeINT8(quantizedData: Int8Array, config: QuantizationConfig): Float32Array {
    if (config.scale === undefined) {
        throw new Error('Scale parameter required for INT8 dequantization');
    }
    const result = new Float32Array(quantizedData.length);
    const scale = config.scale;
    const zeroPoint = config.zeroPoint ?? 0;

    for (let i = 0; i < quantizedData.length; i++) {
        result[i] = (quantizedData[i] - zeroPoint) / scale;
    }
    return result;
}

/**
 * Dequantizes FP16 back to Float32Array
 */
export function dequantizeFP16(fp16Data: Uint16Array): Float32Array {
    const result = new Float32Array(fp16Data.length);
    for (let i = 0; i < fp16Data.length; i++) {
        result[i] = halfToFloat(fp16Data[i]);
    }
    return result;
}

/**
 * WebGPU-ready buffer creator with automatic type conversion
 * Handles the common use case of preparing data for GPU upload
 */
export function createWebGPUBuffer(
    device: GPUDevice,
    data: SupportedArrayTypes,
    usage: GPUBufferUsageFlags,
    quantization?: QuantizationConfig
): {
	buffer: GPUBuffer; conversionResult?: ArrayConversionResult } {
    // Use a simple union for the processed payload (either raw ArrayBuffer or a typed-array view)
    let processedData: ArrayBuffer | ArrayBufferView;
    let conversionResult: ArrayConversionResult | undefined;

    // Ensure proper array format
    const float32Data = ensureFloat32Array(data);

    // Apply quantization if requested
    if (quantization) {
        switch (quantization.precision) {
            case 'fp16':
                conversionResult = quantizeToFP16(float32Data);
                processedData = conversionResult.data as Uint16Array;
                break;
            case 'int8':
                conversionResult = quantizeToINT8(float32Data, quantization);
                processedData = conversionResult.data as Int8Array;
                break;
            case 'uint8':
                // Simple 8-bit quantization for [0, 1] normalized data
                {
                    const u8 = new Uint8Array(float32Data.length);
                    for (let i = 0; i < float32Data.length; i++) {
                        u8[i] = Math.round(Math.max(0, Math.min(1, float32Data[i])) * 255);
                    }
                    processedData = u8;
                    conversionResult = {
                        data: processedData,
                        originalSize: float32Data.length * 4,
                        compressedSize: u8.byteLength,
                        compressionRatio: 4.0,
                        quantizationConfig: quantization
                    };
                }
                break;
            default:
                processedData = float32Data;
        }
    } else {
        processedData = float32Data;
    }

    // Create GPU buffer
    const buffer = device.createBuffer({
        size: (processedData as ArrayBufferView | ArrayBuffer).byteLength,
        usage,
        mappedAtCreation: true
    });

    // Guard and obtain mapped range safely
    if (typeof buffer.getMappedRange !== 'function') {
        throw new Error('GPUBuffer.getMappedRange is not available on this platform');
    }

    const mapped = buffer.getMappedRange();

    // Robust copy: always create a Uint8Array source view
    let srcUint8: Uint8Array;
    if (processedData instanceof ArrayBuffer) {
        srcUint8 = new Uint8Array(processedData);
    } else {
        const view = processedData as ArrayBufferView;
        srcUint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }

    // Destination view and copy
    const dst = new Uint8Array(mapped);
    dst.set(srcUint8);

    // Unmap
    if (typeof buffer.unmap === 'function') {
        buffer.unmap();
    }

    return { buffer, conversionResult };
}

/**
 * Batch processor for multiple arrays with consistent quantization
 */
export function batchProcessArrays(
    device: GPUDevice,
    arrays: {
	name: string; data: SupportedArrayTypes;
	usage: GPUBufferUsageFlags }[],
    quantization?: QuantizationConfig
): Map<string, { buffer: GPUBuffer; conversionResult?: ArrayConversionResult | undefined }> {
    const results = new Map<string, { buffer: GPUBuffer; conversionResult?: ArrayConversionResult | undefined }>();

    for (const { name, data, usage } of arrays) {
        const result = createWebGPUBuffer(device, data, usage, quantization);
        results.set(name, result);
    }

    return results;
}

// Helper functions for FP16 conversion
function floatToHalf(value: number): number {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = value;
    const x = int32View[0];

    let bits = (x >> 16) & 0x8000; // Sign bit
    let m = (x >> 12) & 0x07ff; // Mantissa
    const e = (x >> 23) & 0xff; // Exponent

    if (e < 103) return bits;

    if (e > 142) {
        bits |= 0x7c00;
        bits |= (e == 255 ? 0 : 1) && (x & 0x007fffff);
        return bits;
    }

    if (e < 113) {
        m |= 0x0800;
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
}

function halfToFloat(value: number): number {
    const s = (value & 0x8000) >> 15;
    const e = (value & 0x7c00) >> 10;
    const f = value & 0x03ff;

    if (e == 0) {
        return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
    } else if (e == 0x1f) {
        return f ? NaN : (s ? -1 : 1) * Infinity;
    }

    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
}

/**
 * Memory usage analyzer for optimization decisions
 */
export function analyzeMemoryUsage(
    original: SupportedArrayTypes,
    quantizations: QuantizationConfig[] = [
        { precision: 'fp32' },
	{ precision: 'fp16' },
	{ precision: 'int8' },
	{ precision: 'uint8' }
    ]
): Array<{
	precision: string; sizeBytes: number;
	compressionRatio: number; estimatedAccuracyLoss: number }> {
    const float32Data = ensureFloat32Array(original);
    const originalSize = float32Data.length * 4;

    return quantizations.map((config) => {
        let sizeBytes: number;
        let estimatedAccuracyLoss: number;

        switch (config.precision) {
            case 'fp32':
                sizeBytes = originalSize;
                estimatedAccuracyLoss = 0;
                break;
            case 'fp16':
                sizeBytes = float32Data.length * 2;
                estimatedAccuracyLoss = 0.01; // ~1% typical accuracy loss
                break;
            case 'int8':
                sizeBytes = float32Data.length * 1;
                estimatedAccuracyLoss = 0.05; // ~5% typical accuracy loss
                break;
            case 'uint8':
                sizeBytes = float32Data.length * 1;
                estimatedAccuracyLoss = 0.08; // ~8% typical accuracy loss for signed data
                break;
            default:
                sizeBytes = originalSize;
                estimatedAccuracyLoss = 0;
        }

        return {
            precision: config.precision,
            sizeBytes,
            compressionRatio: originalSize / sizeBytes,
            estimatedAccuracyLoss
        };
    });
}
