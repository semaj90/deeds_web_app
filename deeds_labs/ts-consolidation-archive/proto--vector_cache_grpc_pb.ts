/**
 * gRPC Vector Cache Client Stub
 * Provides TypeScript types for vector cache service
 */

export class VectorCacheServiceClient {
	constructor(address: string, credentials?: any, options?: any) {
		console.log('VectorCacheServiceClient initialized (stub)');
	}

	embedLookup(request: any, callback: (error: Error | null, response: any) => void): void {
		callback(null, { embeddings: [] });
	}

	embedStore(request: any, callback: (error: Error | null, response: any) => void): void {
		callback(null, { success: true });
	}
}
