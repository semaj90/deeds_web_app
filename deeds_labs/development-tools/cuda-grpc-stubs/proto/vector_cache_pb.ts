/**
 * gRPC Vector Cache Protocol Buffers Stub
 * Provides TypeScript types for vector cache messages
 */

export class EmbedLookupRequest {
	private keys: string[] = [];

	getKeysList(): string[] {
		return this.keys;
	}

	setKeysList(keys: string[]): void {
		this.keys = keys;
	}

	serializeBinary(): Uint8Array {
		return new Uint8Array();
	}

	static deserializeBinary(bytes: Uint8Array): EmbedLookupRequest {
		return new EmbedLookupRequest();
	}
}

export class EmbedStoreRequest {
	private key: string = '';
	private embedding: number[] = [];
	private ttl: number = 0;

	getKey(): string {
		return this.key;
	}

	setKey(key: string): void {
		this.key = key;
	}

	getEmbedding(): number[] {
		return this.embedding;
	}

	setEmbedding(embedding: number[]): void {
		this.embedding = embedding;
	}

	getTtl(): number {
		return this.ttl;
	}

	setTtl(ttl: number): void {
		this.ttl = ttl;
	}

	serializeBinary(): Uint8Array {
		return new Uint8Array();
	}

	static deserializeBinary(bytes: Uint8Array): EmbedStoreRequest {
		return new EmbedStoreRequest();
	}
}

export class EmbedLookupResponse {
	private embeddings: Map<string, number[]> = new Map();

	getEmbeddingsMap(): Map<string, number[]> {
		return this.embeddings;
	}

	serializeBinary(): Uint8Array {
		return new Uint8Array();
	}

	static deserializeBinary(bytes: Uint8Array): EmbedLookupResponse {
		return new EmbedLookupResponse();
	}
}

export class EmbedStoreResponse {
	private success: boolean = false;

	getSuccess(): boolean {
		return this.success;
	}

	setSuccess(success: boolean): void {
		this.success = success;
	}

	serializeBinary(): Uint8Array {
		return new Uint8Array();
	}

	static deserializeBinary(bytes: Uint8Array): EmbedStoreResponse {
		return new EmbedStoreResponse();
	}
}
