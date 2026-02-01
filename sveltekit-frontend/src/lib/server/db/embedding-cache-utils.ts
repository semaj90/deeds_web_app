// Utilities to encode/decode packed embeddings for embedding_cache table
// Packed embeddings stored as base64 text representing Uint8Array (quantized 0-255) or int8 symmetric (-128..127)

export interface PackedEmbeddingMeta {
	scale?: number; // scaling factor for symmetric int8 dequantization
	method: 'uint8-linear' | 'int8-symmetric';
	dims: number;
}

export function packFloat32ToUint8(vec: Float32Array): Uint8Array {
	let min = Infinity, max = -Infinity;
	for (let i = 0; i < vec.length; i++) {
		const v = vec[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const range = max - min || 1;
	const out = new Uint8Array(vec.length);
	for (let i = 0; i < vec.length; i++) {
		out[i] = Math.min(255, Math.max(0, Math.round(((vec[i] - min) / range) * 255)));
	}
	return out;
}

export function unpackUint8ToFloat32(packed: Uint8Array, min: number, max: number): Float32Array {
	const range = max - min || 1;
	const out = new Float32Array(packed.length);
	for (let i = 0; i < packed.length; i++) {
		out[i] = min + (packed[i] / 255) * range;
	}
	return out;
}

export function quantizeInt8Symmetric(vec: Float32Array): {
	data: Int8Array; scale: number } {
	let maxAbs = 0;
	for (let i = 0; i < vec.length; i++) {
		const a = Math.abs(vec[i]);
		if (a > maxAbs) maxAbs = a;
	}
	const scale = maxAbs / 127 || 1;
	const out = new Int8Array(vec.length);
	for (let i = 0; i < vec.length; i++) {
		out[i] = Math.max(-128, Math.min(127, Math.round(vec[i] / scale)));
	}
	return { data: out, scale };
}

export function dequantizeInt8Symmetric(data: Int8Array, scale: number): Float32Array {
	const out = new Float32Array(data.length);
	for (let i = 0; i < data.length; i++) {
		out[i] = data[i] * scale;
	}
	return out;
}

export function encodeBase64(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64');
}

export function decodeBase64(b64: string): Uint8Array {
	return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function packEmbedding(
	vec: number[] | Float32Array,
	method: 'uint8-linear' | 'int8-symmetric' = 'int8-symmetric'
): {
	b64: string; scale?: number;
	method: 'uint8-linear' | 'int8-symmetric' } {
	const arr = vec instanceof Float32Array ? vec : new Float32Array(vec);

	if (method === 'uint8-linear') {
		// store min/max followed by data
		let min = Infinity, max = -Infinity;
		for (let v of arr) {
			if (v < min) min = v;
			if (v > max) max = v;
		}
		const packed = packFloat32ToUint8(arr);
		const header = new Float32Array([min, max]);
		const bytes = new Uint8Array(header.buffer.byteLength + packed.byteLength);
		bytes.set(new Uint8Array(header.buffer), 0);
		bytes.set(packed, header.buffer.byteLength);
		return {
			b64: encodeBase64(bytes),
			method: 'uint8-linear'
		};
	} else {
		const { data, scale } = quantizeInt8Symmetric(arr);
		// store scale as float32 header
		const header = new Float32Array([scale]);
		const bytes = new Uint8Array(header.buffer.byteLength + data.byteLength);
		bytes.set(new Uint8Array(header.buffer), 0);
		bytes.set(new Uint8Array(data.buffer), header.buffer.byteLength);
		return {
			b64: encodeBase64(bytes),
			scale,
			method: 'int8-symmetric'
		};
	}
}

export function unpackEmbedding(
	b64: string,
	method: 'uint8-linear' | 'int8-symmetric',
	dims: number
): Float32Array {
	const bytes = decodeBase64(b64);

	if (method === 'uint8-linear') {
        const headerSize = 2 * 4; // 2 floats * 4 bytes
		if (bytes.length < headerSize) return new Float32Array(dims);

		const header = new Float32Array(bytes.buffer.slice(0, headerSize));
		const min = header[0];
		const max = header[1];
		const data = new Uint8Array(bytes.buffer.slice(headerSize));
		return unpackUint8ToFloat32(data, min, max);
	} else {
        const headerSize = 1 * 4; // 1 float * 4 bytes
        if (bytes.length < headerSize) return new Float32Array(dims);

		const header = new Float32Array(bytes.buffer.slice(0, headerSize));
		const scale = header[0];
		const data = new Int8Array(bytes.buffer.slice(headerSize));
		return dequantizeInt8Symmetric(data, scale);
	}
}

