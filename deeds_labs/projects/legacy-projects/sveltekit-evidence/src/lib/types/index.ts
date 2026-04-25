// Core evidence and case types for the legal AI platform
export interface Evidence {
  id: string;
  caseId: string;
  filename: string; // Match the component usage
  type: "image" | "document" | "audio" | "video" | "text";
  filePath: string;
  minioUrl: string; // URL for file access
  uploadedAt: Date | string;
  uploadedBy: string;
  tags: string[];
  notes?: string; // Match component usage
  metadata: {
    size: number;
    originalName?: string;
    mimeType?: string;
    [key: string]: any;
  };
  boardPosition?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
}

export interface Case {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  status: "open" | "investigating" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  evidence: Evidence[];
  tags: string[];
  metadata?: Record<string, any>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user" | "detective";
  createdAt: Date;
  lastLogin?: Date;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface BoardElement {
  id: string;
  type: "evidence" | "note" | "connection";
  position: { x: number; y: number };
  data: any;
}

export interface AIAnalysis {
  id: string;
  evidenceId: string;
  analysisType: "similarity" | "classification" | "entity_extraction";
  results: Record<string, any>;
  confidence: number;
  createdAt: Date;
}

// Additional types for the stores
export interface Crime {
  id: string;
  caseId: string;
  type: string;
  description: string;
  location?: string;
  timestamp?: Date | string;
  status: "reported" | "investigating" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, any>;
}

export interface Report {
  id: string;
  caseId: string;
  title: string;
  type: "incident" | "evidence" | "analysis" | "summary";
  content: string;
  createdBy: string;
  createdAt: Date | string;
  status: "draft" | "review" | "approved" | "published";
  metadata?: Record<string, any>;
}

export interface TimelineItem {
  id: string;
  caseId: string;
  timestamp: Date | string;
  title: string;
  description: string;
  type:
    | "evidence_added"
    | "crime_logged"
    | "report_created"
    | "note_added"
    | "status_changed";
  relatedItemId?: string;
  createdBy: string;
  metadata?: Record<string, any>;
}

export interface BoardObject {
  id: string;
  type: "image" | "text" | "note" | "connection";
  position: { x: number; y: number };
  size?: { width: number; height: number };
  url?: string; // For images
  content?: string; // For text/notes
  evidenceId?: string; // Reference to evidence
  connections?: string[]; // Connected object IDs
  metadata?: Record<string, any>;
}
