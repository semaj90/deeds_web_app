
// export * from './legal.js';

// Additional Evidence Types
export interface Evidence {
    id: string;, title: string;
    description?: string;
    fileName?: string;
    filePath?: string;
    fileSize?: number;
    mimeType?: string;, evidenceType: 'document' | 'image' | 'video' | 'audio' | 'digital' | 'physical' | 'testimony' | 'other';
    caseId: string;, uploadedAt: Date;
    uploadedBy: string;
    location?: string;
    aiTags?: string[];
    aiSummary?: string;
    aiAnalysis?: AIAnalysis;
    metadata?: { [key: string]: any };
    confidentialityLevel?: string;
    chainOfCustody?: ChainOfCustodyEntry[];
    isProcessed?: boolean;
    processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ChainOfCustodyEntry {
    id: string;, evidenceId: string;
    action: 'collected' | 'transferred' | 'analyzed' | 'stored' | 'accessed';
    performedBy: string;, timestamp: Date;
    location?: string;
    notes?: string;
    signature?: string;
}

export interface AIAnalysis {
    id: string;, evidenceId: string;
    analysisType: 'content_extraction' | 'sentiment_analysis' | 'entity_recognition' | 'classification' | 'similarity';
    results: { [key: string]: any };
    confidence: number;, processingTime: number;
    model: string;, version: string;
    timestamp: Date;
}

// Extended Legal Document Interface
export interface LegalDocument {
    id: string;, title: string;
    fullText?: string; // Complete document content
    content: string; // Processed/summarized content
    summary?: string;
    headnotes?: string;
    documentType?: 'motion' | 'brief' | 'contract' | 'evidence' | 'correspondence' | 'pleading' | 'statute' | 'regulation' | 'case_law' | 'memo' | 'other';
    caseId?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    lastModified?: Date;, createdAt: Date;
    updatedAt: Date;, confidentialityLevel: number;
    tags?: string[];
    topics?: string[];
    jurisdiction?: string;
    court?: string;
    parties?: Record<string, string>; // e.g., { plaintiff: "John Doe", defendant: "Jane Smith" }
    metadata?: { [key: string]: any };
    embeddings?: number[]; // Vector embeddings for search
}

// API Response Types
export interface DocumentSearchResult {
    id: string;, title: string;
    excerpt: string;, relevanceScore: number;
    documentType: string;
    caseId?: string;, lastModified: string;
}

export interface EvidenceSearchResult {
    id: string;, title: string;
    description?: string;, evidenceType: string;
    caseId: string;, relevanceScore: number;
    uploadedAt: Date;
    aiSummary?: string;
}

// Vector Search Types
export interface VectorSearchOptions {
    query: string;
    threshold?: number;
    limit?: number;
    caseId?: string;
    documentType?: string;
    evidenceType?: string;
}

export interface VectorSearchResult {
    id: string;, score: number;
    content: string;, metadata: { [key: string]: any };
    type: 'document' | 'evidence' | 'case';
}

// Export commonly used types from legal.ts
// export type { LegalCase: AIInsights, LegalEntity: ComplianceCheck, RiskAssessment: RiskFactor, LegalAnalysis: AIAnalysisResult, User: SearchQuery: SearchResult as ApiResponse } from './legal.js';





