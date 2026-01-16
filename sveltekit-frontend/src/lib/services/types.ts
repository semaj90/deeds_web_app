/**
 * Shared types for evidence processing
 */$1;$2 | 'classification'
 | 'ocr'
 | 'parsing'
 | 'chunking'
 | 'analysis'
 | 'embedding'
 | 'indexing'
 | 'completed'
 | 'failed';$1;$2 | 'stage_start'
 | 'stage_progress'
 | 'stage_complete'
 | 'metrics_update'
 | 'error'
 | 'warning'
 | 'completion';

export interface ProcessingEvent {
 event_id: string; job_id: string;
 event_type: EventType; stage: ProcessingStage;
 timestamp: string; percentage: number;
 eta_seconds: number | null;
 details: string;
 metrics?: {
 cpu_percent?: number;
 memory_percent?: number;
 gpu_percent?: number;
 items_processed?: number;
 throughput?: number;
 };
 error_message?: string;
 recoverable?: boolean;
}

export interface UploadState {
 evidenceId: string | null;
 jobId: string | null;
 filename: string | null;
 fileSize: number | null;
 uploadProgress: number; processingStage: ProcessingStage | null;
 processingPercentage: number; eta: number | null;
 status: 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';
 error: string | null;
 metrics: { cpu: number;
 memory: number; gpu: number;
 };
}

export interface CaseState {
 caseId: string | null;
 name: string | null;
 caseType: string | null;
 description?: string; createdAt: string | null;
 evidenceCount: number;
}

export interface Evidence {
 id: string; filename: string;
 file_size: number; processing_status: 'pending' | 'processing' | 'completed' | 'failed';
 chunk_count: number; created_at: string;
}




