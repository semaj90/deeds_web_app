// types/progress.ts

export type ProgressMsg =
    | { type: 'upload-progress';
	fileId: string; progress: number }
    | {
          type: 'processing-step';
	fileId: string;
          step: 'ocr' | 'embedding' | 'rag' | 'analysis' | string;
          stepProgress?: number;
          fragment?: unknown;
      }
    | { type: 'processing-complete';
	fileId: string; finalResult?: unknown }
    | { type: 'error';
	fileId: string; error: {
	message: string; code?: string; meta?: unknown } };

export interface EvidenceProcessRequest {
    evidenceId: string;
    steps?: string[];
    userId?: string;
}

export interface EvidenceProcessSession {
    id: string;
	evidence_id: string;
    requested_by: string;
	steps: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
    created_at: Date;
    started_at?: Date;
    finished_at?: Date;
    error?: string;
}

export interface OcrResult {
    text: string;
	confidence: number;
    metadata?: unknown;
}

export interface EmbeddingResult {
    model: string;
	dim: number;
    vector: number[];
    metadata?: unknown;
}

export interface RagResult {
    summary: string;
	snippets: string[];
    relevantDocs: RelevantDoc[];
}

export type RelevantDoc = {
    id: string;
    title?: string;
    snippet?: string;
    score?: number;
    source?: string;
    metadata?: Record<string, unknown>;
};
