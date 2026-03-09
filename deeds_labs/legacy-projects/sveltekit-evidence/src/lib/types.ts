/**
 * Core types for the streamlined evidence board application
 */

export interface Case {
  id: string;
  title: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: "open" | "closed" | "under_investigation";
  assignedTo?: string;
}

export interface Crime {
  id: string;
  caseId: string;
  type: string;
  description: string;
  location?: string;
  timestamp?: Date;
  severity: "low" | "medium" | "high" | "critical";
}

export interface Evidence {
  id: string;
  caseId: string;
  filename: string;
  type: "image" | "document" | "audio" | "video" | "text";
  minioUrl: string;
  uploadedAt: Date;
  uploadedBy: string;
  metadata: {
    size: number;
    mimeType: string;
    checksum: string;
    extractedText?: string;
    ocrResults?: string;
    audioTranscript?: string;
    embedding?: number[];
  };
  tags: string[];
  notes?: string;
}

export interface Report {
  id: string;
  caseId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  createdBy: string;
  type: "investigation" | "forensic" | "witness" | "summary";
  status: "draft" | "final" | "reviewed";
}

export interface TimelineItem {
  id: string;
  caseId: string;
  timestamp: Date;
  title: string;
  description: string;
  type:
    | "evidence_added"
    | "crime_logged"
    | "report_created"
    | "investigation_update";
  relatedItemId?: string; // evidence ID, crime ID, etc.
  createdBy: string;
}

export interface BoardObject {
  id: string;
  type: "image" | "text" | "note" | "connection";
  position: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  content?: string; // for text objects
  url?: string; // for image objects
  evidenceId?: string; // reference to evidence
  metadata?: Record<string, any>;
  connections?: string[]; // IDs of connected objects
}

export interface ChatMessage {
  id: string;
  caseId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  context?: {
    evidenceIds: string[];
    reportIds: string[];
    queryEmbedding?: number[];
  };
}

export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
}

export interface IngestionJob {
  id: string;
  evidenceId: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result?: {
    extractedText?: string;
    ocrText?: string;
    audioTranscript?: string;
    embedding?: number[];
    metadata?: Record<string, any>;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
