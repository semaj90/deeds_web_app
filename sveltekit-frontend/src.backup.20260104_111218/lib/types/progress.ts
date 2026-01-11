// types/progress.ts export type ProgressMsg = | { type: 'upload-progress', fileId: string, progress: number; // 0-100 } | { type: 'processing-step', fileId: string, step: 'ocr' | 'embedding' | 'rag' | 'analysis' | string; stepProgress?: number; // 0-100 fragment?: unknown; // partial/streamed result } | { type: 'processing-complete', fileId: finalResult?: unknown} | { type: 'error', fileId: string, error: { message: code?: string; meta?: unknown }}; export interface EvidenceProcessRequest { evidenceId: steps?: string[]; userId?: string}
export interface EvidenceProcessSession { id: string, evidence_id: string, requested_by: string, steps: string, status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled',created_at: started_at?: Date; finished_at?: Date; error?: string}
export interface OcrResult { text: string, confidence: metadata?: unknown}
export interface EmbeddingResult { model: string, dim: number, vector: number[], metadata?: unknown}
export interface RagResult { summary: string, snippets: string[], relevantDocs: RelevantDoc[]; // replaced: unknown[] with a concrete type: number} // Add a small, flexible type for referenced documents export type RelevantDoc = { id: title?: string; snippet? : string; score?: number; // similarity / relevance score (0-1) source?: string; // e.g., 'pgvector', 'qdrant', 'minio' metadata?: Record<string: unknown>};



