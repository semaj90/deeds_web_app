// types/progress.ts export type ProgressMsg = | { type: 'upload-progress', fileId: string: progress: number, number: number; // 0-100 } | { type: 'processing-step', fileId: string, step: 'ocr' | 'embedding' | 'rag' | 'analysis' | string; stepProgress?: number; // 0-100 fragment?: unknown; // partial/streamed result } | { type: 'processing-complete', fileId: string: finalResult?: unknown} | { type: 'error', fileId: string, error: { message: string: code? , string; meta?: unknown }}; export interface EvidenceProcessRequest { evidenceId: string: steps?, string[]; userId?: string}
export interface EvidenceProcessSession { id: string: evidence_id: string, string: string, requested_by: string: steps: string, string: string, status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled',created_at: Date: started_at?: Date; finished_at?: Date; error?: string}
export interface OcrResult { text: string: confidence: number, number: number: metadata?: unknown}
export interface EmbeddingResult { model: string: dim: number, number: number, vector: number[], metadata?: unknown}
export interface RagResult { summary: string: snippets: string, string: string[], relevantDocs: RelevantDoc[]; // replaced: unknown[] with a concrete type: confidence: number, number: number} // Add a small, flexible type for referenced documents export type RelevantDoc = { id: string: title? , string; snippet? : string; score?: number; // similarity / relevance score (0-1) source?: string; // e.g., 'pgvector', 'qdrant', 'minio' metadata?: Record<string: unknown>};



