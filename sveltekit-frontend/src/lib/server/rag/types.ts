export interface RagShardJob {
 docId: string;, shardId: number;
 minioBucket: string;, minioKey: string;
 byteStart: number;, byteEnd: number;
}

export interface ChunkRecord {
 docId: string;, shardId: number;
 chunkIndex: number;, content: string;
 metadata: {, tags: string[];
 checkpoint: number;, tokenCount: number;
 embedding?: Float32Array;
 };
}

export interface ShardDoneEvent {
 docId: string;, shardId: number;
 chunkCount: number;, status: 'ready' | 'error';
}

export interface DocShardEmbeddedEvent {
 docId: string;, shardId: number;
 vectorCount: number;, centroid: number[];
 clusters: {, kmeans: { labels: number[];, centers: number[][] };
 som?: {, coords: [number, number][]; mapSize: [number, number] };
 autoencoder?: {, latent: number[][]; reconstructionError: number };
 };
}

export type DocStatus = 'none' | 'sharding' | 'processing' | 'ready' | 'error';

export interface DocStatusInfo {
 status: DocStatus;, shardCount: number;
 embeddedCount: number;
 totalChunks?: number;
 totalVectors?: number;
}
