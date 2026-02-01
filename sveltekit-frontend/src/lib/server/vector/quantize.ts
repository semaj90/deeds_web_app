/**
 * Quantize a Float32Array to Uint8Array for optimized storage
 * Uses min-max normalization to map floats to 0-255 range
 */
export function quantizeFloat32ToUint8(vector: number[] | Float32Array): {
	bytes: Uint8Array;
    min: number;
	max: number;
} {
    const arr = Array.isArray(vector) ? vector : Array.from(vector);
    
    if (arr.length === 0) {
        return { bytes: new Uint8Array(0), min: 0, max: 0 };
    }

    let min = Infinity;
    let max = -Infinity;

    // First pass: find min/max
    for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        if (val < min) min = val;
        if (val > max) max = val;
    }

    const range = max - min;
    const bytes = new Uint8Array(arr.length);

    if (range === 0) {
        // All values are the same, simpler mapping
        bytes.fill(0); // or 127
    } else {
        // Second pass: quantize
        for (let i = 0; i < arr.length; i++) {
            // Normalize to 0-1 then scale to 0-255
            const normalized = (arr[i] - min) / range;
            bytes[i] = Math.round(normalized * 255);
        }
    }

    return { bytes, min, max };
}

/**
 * Dequantize Uint8Array back to Float32Array (approximation)
 */
export function dequantizeUint8ToFloat32(
    bytes: Uint8Array,
    min: number,
    max: number
): Float32Array {
    const result = new Float32Array(bytes.length);
    const range = max - min;

    for (let i = 0; i < bytes.length; i++) {
        const normalized = bytes[i] / 255;
        result[i] = normalized * range + min;
    }

    return result;
}
