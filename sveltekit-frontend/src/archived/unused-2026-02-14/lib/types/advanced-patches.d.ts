// Advanced Type Patches for Complex Services

declare global {
	namespace Fuse {
		interface FuseOptions<T> {
			keys?: (Extract<keyof T, string> | { name: Extract<keyof T, string>; weight: number })[];
			threshold?: number;
			includeScore?: boolean;
			distance?: number;
			minMatchCharLength?: number;
			isCaseSensitive?: boolean;
			includeMatches?: boolean;
			findAllMatches?: boolean;
			location?: number;
			useExtendedSearch?: boolean;
			ignoreLocation?: boolean;
			ignoreFieldNorm?: boolean;
			fieldNormWeight?: number;
		}
	}

	interface BufferLike {
		byteLength: number;
		length?: number;
	}

	interface Asset3DSearchResult {
		id: string;
		score: number;
	}

	interface HybridRAGResult {
		content: string;
		score: number;
	}

	interface ChatRequest {
		messages: unknown[];
		stream?: boolean;
	}

	interface ChatResponse {
		message: string;
		done: boolean;
	}

	interface GPUSearchMetrics {
		searchTime: number;
		resultCount: number;
	}

	interface PipelineSearchResult {
		id: string;
		score: number;
		snippet: string;
		source: string;
	}
}

export {};
