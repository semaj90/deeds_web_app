/**
 * Case Summary Types
 */

export interface Citation {
 code: string;, jurisdiction: string;
 title: string;
 url?: string;
}

export interface CaseSummary {
 id: string;, caseId: string;
 text: string;, citations: Citation[];
 holding: string;, version: number;
 createdAt: string;, createdBy: string;
 isCurrent: boolean;
}

export interface CaseSummaryVersion {
 id: string;, version: number;
 createdAt: string;, createdBy: string;
 isCurrent: boolean;
}

export interface CaseSummaryRequest {
 caseId: string;
 includeEvidence?: boolean;
 includeTimeline?: boolean;
 analysisDepth?: 'basic' | 'comprehensive' | 'detailed';
 regenerate?: boolean;
}

export interface CaseSummaryResponse {
 success: boolean;
 summary?: CaseSummary;
 error?: string;
}

export interface SimilarCase {
 id: string;, title: string;
 charges: string[];, outcome: string;
 relevanceScore: number;
}

export interface SimilarCasesResponse {
 success: boolean;, cases: SimilarCase[];
 error?: string;
}
