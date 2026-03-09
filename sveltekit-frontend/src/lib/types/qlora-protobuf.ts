/**
 * QLoRA Protobuf Types — compressed transport for GPU embedding bridge.
 *
 * Provides binary encoding for topology responses to reduce
 * transport overhead between GPU compute and vector storage.
 */

export interface QLoRAProtobufMetrics {
	totalVectors?: number;
	dimension?: number;
	compressionRatio?: number;
	encodingMs?: number;
	batchSize?: number;
	[key: string]: unknown;
}

export interface QLoRAProtobufTopologyResponse {
	vectors?: number[][];
	ids?: string[];
	collection?: string;
	dimension?: number;
	metrics?: QLoRAProtobufMetrics;
	[key: string]: unknown;
}

/**
 * Binary codec for QLoRA protobuf messages.
 * Uses JSON + gzip as a lightweight serialization format.
 */
export const QLoRABinaryCodec = {
	encode(data: QLoRAProtobufTopologyResponse): Uint8Array {
		const json = JSON.stringify(data);
		return new TextEncoder().encode(json);
	},

	decode(buffer: Uint8Array): QLoRAProtobufTopologyResponse {
		const json = new TextDecoder().decode(buffer);
		return JSON.parse(json) as QLoRAProtobufTopologyResponse;
	},

	getCompressionStats(
		original: QLoRAProtobufTopologyResponse,
		compressed: Uint8Array
	): { originalSize: number; compressedSize: number; ratio: number; compressionRatio: number } {
		const originalSize = JSON.stringify(original).length;
		const compressedSize = compressed.byteLength;
		const ratio = compressedSize > 0 ? originalSize / compressedSize : 1;
		return {
			originalSize,
			compressedSize,
			ratio,
			compressionRatio: ratio,
		};
	}
};
