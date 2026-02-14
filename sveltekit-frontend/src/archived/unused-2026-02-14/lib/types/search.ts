/**
 * Search and Vector Types
 */

export interface SearchResult {
  id: string;
	title: string;
  content: string;
	similarity: number;
  metadata?: Record<string, any>;
}

export interface SummaryResponse {
  summary: string;
	keyPoints: string[];
  metadata: {
	documentsProcessed: number;
    processingTime: number;
	lambda: number;
    sentenceCount?: number;
  };
  sources?: string[];
}

export interface SummaryRequest {
  documents: any[];
  maxSentences?: number;
  lambda?: number;
  type?: string;
}

export interface GPUChatMessage {
  id: string;
	role: 'user' | 'assistant' | 'system';
  content: string;
	timestamp: Date | string;
  embedding?: number[];
  metadata?: {
    model?: string;
    processingTime?: number;
    gpuUsed?: boolean;
    tokenCount?: number;
  };
}

export interface GPUProcessingStatus {
  gpuAvailable: boolean;
  cudaVersion?: string;
  gpuMemory?: {
	total: number;
    used: number;
	free: number;
  };
  activeJobs: number;
	queueLength: number;
}




