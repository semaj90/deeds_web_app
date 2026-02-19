// Protobuf serialization for tensor caching
import * as pb from 'protobufjs';

// Define proto schema in code (will be compiled from .proto file)
const protoSchema = `
syntax = "proto3";

message TensorCache {
  string tensor_id = 1;
  bytes data = 2;
  repeated uint64 shape = 3;
  string dtype = 4;
  repeated string parent_ids = 5;
  bool on_gpu = 6;
  int64 timestamp = 7;
  map<string, string> metadata = 8;
}

message TensorBatch {
  repeated TensorCache tensors = 1;
  string batch_id = 2;
  int64 created_at = 3;
}

message TensorRequest {
  string tensor_id = 1;
  bool load_to_gpu = 2;
  repeated string parent_ids = 3;
}

message TensorResponse {
  TensorCache tensor = 1;
  bool from_cache = 2;
  int64 latency_ms = 3;
}
`;

export class ProtoSerializer {
    private root: pb.Root;
    private TensorCache: pb.Type;
    private TensorBatch: pb.Type;
    private TensorRequest: pb.Type;
    private TensorResponse: pb.Type;

    constructor() {
        this.root = pb.parse(protoSchema).root;
        this.TensorCache = this.root.lookupType('TensorCache');
        this.TensorBatch = this.root.lookupType('TensorBatch');
        this.TensorRequest = this.root.lookupType('TensorRequest');
        this.TensorResponse = this.root.lookupType('TensorResponse');
    }

    // Serialize tensor to protobuf bytes
    serializeTensor(tensor: {
        tensorId: string;
        data: ArrayBuffer;
        shape: number[];
        dtype: string;
        parentIds?: string[];
        onGpu?: boolean;
        metadata?: Record<string, string>;
    }): Uint8Array {
        const message = this.TensorCache.create({
            tensorId: tensor.tensorId,
            data: new Uint8Array(tensor.data),
            shape: tensor.shape,
            dtype: tensor.dtype,
            parentIds: tensor.parentIds || [],
            onGpu: tensor.onGpu || false,
            timestamp: Date.now(),
            metadata: tensor.metadata || {}
        });

        return this.TensorCache.encode(message).finish();
    }

    // Deserialize protobuf bytes to tensor
    deserializeTensor(bytes: Uint8Array): {
        tensorId: string;
        data: ArrayBuffer;
        shape: number[];
        dtype: string;
        parentIds: string[];
        onGpu: boolean;
        timestamp: number;
        metadata: Record<string, string>;
    } {
        const message = this.TensorCache.decode(bytes);
        const obj = this.TensorCache.toObject(message);

        return {
            tensorId: obj.tensorId,
            data: obj.data.buffer,
            shape: obj.shape,
            dtype: obj.dtype,
            parentIds: obj.parentIds,
            onGpu: obj.onGpu,
            timestamp: obj.timestamp,
            metadata: obj.metadata
        };
    }

    // Serialize batch of tensors
    serializeBatch(tensors: any[], batchId: string): Uint8Array {
        const tensorMessages = tensors.map(t => this.TensorCache.create({
            tensorId: t.tensorId,
            data: new Uint8Array(t.data),
            shape: t.shape,
            dtype: t.dtype,
            parentIds: t.parentIds || [],
            onGpu: t.onGpu || false,
            timestamp: t.timestamp || Date.now(),
            metadata: t.metadata || {}
        }));

        const batch = this.TensorBatch.create({
            tensors: tensorMessages,
            batchId: batchId,
            createdAt: Date.now()
        });

        return this.TensorBatch.encode(batch).finish();
    }

    // Deserialize batch
    deserializeBatch(bytes: Uint8Array): {
        tensors: any[];
        batchId: string;
        createdAt: number;
    } {
        const message = this.TensorBatch.decode(bytes);
        const obj = this.TensorBatch.toObject(message);

        return {
            tensors: obj.tensors.map((t: any) => ({
                tensorId: t.tensorId,
                data: t.data.buffer,
                shape: t.shape,
                dtype: t.dtype,
                parentIds: t.parentIds,
                onGpu: t.onGpu,
                timestamp: t.timestamp,
                metadata: t.metadata
            })),
            batchId: obj.batchId,
            createdAt: obj.createdAt
        };
    }

    // Create request message
    createRequest(tensorId: string, loadToGpu: boolean = false): Uint8Array {
        const request = this.TensorRequest.create({
            tensorId: tensorId,
            loadToGpu: loadToGpu,
            parentIds: []
        });

        return this.TensorRequest.encode(request).finish();
    }

    // Parse response message
    parseResponse(bytes: Uint8Array): {
        tensor: any;
        fromCache: boolean;
        latencyMs: number;
    } {
        const message = this.TensorResponse.decode(bytes);
        const obj = this.TensorResponse.toObject(message);

        return {
            tensor: {
                tensorId: obj.tensor.tensorId,
                data: obj.tensor.data.buffer,
                shape: obj.tensor.shape,
                dtype: obj.tensor.dtype,
                parentIds: obj.tensor.parentIds,
                onGpu: obj.tensor.onGpu,
                timestamp: obj.tensor.timestamp,
                metadata: obj.tensor.metadata
            },
            fromCache: obj.fromCache,
            latencyMs: obj.latencyMs
        };
    }

    // Utility: Calculate compressed size
    getCompressedSize(tensor: any): number {
        const serialized = this.serializeTensor(tensor);
        return serialized.byteLength;
    }

    // Utility: Batch compress multiple tensors
    compressBatch(tensors: any[]): {
        original: number;
        compressed: number;
        ratio: number;
    } {
        let originalSize = 0;
        tensors.forEach(t => {
            originalSize += t.data.byteLength +
                           JSON.stringify(t).length;
        });

        const compressed = this.serializeBatch(
            tensors,
            `batch_${Date.now()}`
        );

        return {
            original: originalSize,
            compressed: compressed.byteLength,
            ratio: originalSize / compressed.byteLength
        };
    }
}

// QUIC stream handler for real-time tensor streaming
export class QUICTensorStream {
    private serializer: ProtoSerializer;
    private stream: WritableStream | null = null;
    private reader: ReadableStream | null = null;

    constructor() {
        this.serializer = new ProtoSerializer();
    }

    // Initialize QUIC connection (using WebTransport API)
    async connect(url: string) {
        if (!('WebTransport' in window)) {
            throw new Error('WebTransport not supported');
        }

        // @ts-ignore - WebTransport is experimental
        const transport = new WebTransport(url);
        await transport.ready;

        // Create bidirectional stream for tensor data
        const stream = await transport.createBidirectionalStream();
        this.stream = stream.writable;
        this.reader = stream.readable;

        // Start reading responses
        this.startReading();
    }

    // Send tensor over QUIC
    async sendTensor(tensor: any) {
        if (!this.stream) {
            throw new Error('Not connected');
        }

        const data = this.serializer.serializeTensor(tensor);
        const writer = this.stream.getWriter();

        try {
            // Write length prefix
            const lengthBuffer = new ArrayBuffer(4);
            new DataView(lengthBuffer).setUint32(0, data.byteLength, true);
            await writer.write(new Uint8Array(lengthBuffer));

            // Write tensor data
            await writer.write(data);
        } finally {
            writer.releaseLock();
        }
    }

    // Read tensor responses
    private async startReading() {
        if (!this.reader) return;

        const reader = this.reader.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // Parse response
                const response = this.serializer.parseResponse(value);

                // Emit event
                window.dispatchEvent(new CustomEvent('tensor-received', {
                    detail: response
                }));
            }
        } catch (error) {
            console.error('Read error:', error);
        } finally {
            reader.releaseLock();
        }
    }

    // Batch send with compression
    async sendBatch(tensors: any[]) {
        const batchData = this.serializer.serializeBatch(
            tensors,
            `batch_${Date.now()}`
        );

        const writer = this.stream!.getWriter();

        try {
            // Send as single message
            const lengthBuffer = new ArrayBuffer(4);
            new DataView(lengthBuffer).setUint32(0, batchData.byteLength, true);
            await writer.write(new Uint8Array(lengthBuffer));
            await writer.write(batchData);
        } finally {
            writer.releaseLock();
        }
    }

    close() {
        this.stream?.close();
        this.reader?.cancel();
    }
}