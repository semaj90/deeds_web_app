export type EvidenceModality = 'video' | 'audio' | 'image' | 'document';

export type IngestStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoIngestRequest {
  caseId: string;
  title?: string;
  description?: string;
  sourceUrl?: string;
  file?: File;
  operatorApproved?: boolean;
}

export interface VideoTranscriptChunk {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  model: string;
  language?: string;
  translatedText?: string;
}

export interface VideoSummaryResult {
  summary: string;
  keyFacts: string[];
  confidence: number;
}

export interface VideoIngestJob {
  id: string;
  evidenceId: string;
  caseId: string;
  status: IngestStatus;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  model: string;
  language?: string;
  translatedText?: string;
}

export interface VideoIngestResult {
  evidenceId: string;
  jobId: string;
  storageUri: string;
  transcriptCount: number;
  summary: string;
}

export interface QdrantEvidencePayload {
  evidence_id: string;
  case_id: string;
  modality: EvidenceModality;
  view: 'transcript_segment' | 'frame_caption' | 'summary';
  chunk_id: string;
  start_ms?: number;
  end_ms?: number;
  language?: string;
  text?: string;
  source_uri: string;
  trust_tier: 'ground_truth' | 'transcript_candidate' | 'vlm_inference';
  tags: string[];
  entities: string[];
  model?: string;
}
