import type { Document } from '$lib/types';

// Enhanced AI Types for Legal Document Processing
// SvelteKit 2 + Svelte 5 Compatible Types| 'contract_law'
 | 'tort_law'
 | 'criminal_law'
 | 'corporate_law'
 | 'employment_law'
 | 'intellectual_property'
 | 'real_estate'
 | 'family_law'
 | 'tax_law'
 | 'bankruptcy_law'
 | 'immigration_law'
 | 'environmental_law'
 | 'securities_law'
 | 'healthcare_law';| 'US'
 | 'federal'
 | 'state'
 | 'local'
 | 'international'
 | 'EU'
 | 'UK'
 | 'CA'
 | 'AU';

export interface EnhancedSearchOptions {
 query?: string;
 practiceArea?: PracticeArea;
 jurisdiction?: Jurisdiction;
 documentTypes?: string[];
 dateRange?: { from: Date; to: Date };
 maxResults?: number;
 limit?: number;
 minSimilarity?: number;
 includeMetadata?: boolean;
 sortBy?: 'relevance' | 'date' | 'title';
 useCache?: boolean;
 temperature?: number;
 useGPU?: boolean;
 ragMode?: 'basic' | 'enhanced' | 'hybrid';
 includeContext?: boolean;
 filters?: { [key: string]: any };
}

export interface EnhancedSearchResult {
 id: string; title: string;
 content: string; similarity: number;
 practiceArea: PracticeArea; jurisdiction: Jurisdiction;
 documentType: string; metadata: {
 filename?: string;
 pageNumber?: number;
 section?: string;
 keywords?: string[];
 citations?: string[];
 createdAt?: Date;
 updatedAt?: Date;
 };
 highlights?: { field: string; matches: string[] }[];
 confidence: number; relevanceScore: number;
 analysisResults?: {
 keyInsights?: string[];
 risks?: string[];
 recommendations?: string[];
 };
}

export interface AIAnalysisResult {
 summary: string; keyPoints: string[];
 legalConcepts: string[]; citations: string[];
 recommendations: string[]; confidence: number;
 processingTime: number;
}

export interface VectorSearchOptions {
 query: string;
 embedding?: number[];
 limit?: number;
 threshold?: number;
 filters?: Record<string, unknown>;
 includeMetadata?: boolean;
}

export interface VectorSearchResult {
 id: string; content: string;
 score: number; metadata: Record<string, unknown>;
}

// Enhanced AI Processing Types
export interface EnhancedProcessingOptions {
 useGoMicroservice?: boolean;
 enableCaching?: boolean;
 cacheTimeout?: number;
 parallelProcessing?: boolean;
 maxConcurrency?: number;
 includeAnalysis?: boolean;
 analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
}

export interface ProcessingResult {
 success: boolean;
 data?: any;
 error?: string; processingTime: number;
 cacheHit?: boolean;
 source?: 'go-microservice' | 'local-ai' | 'cache';
}

// AI Model Configuration
export interface AIModelConfig {
 modelName: string;
 temperature?: number;
 maxTokens?: number;
 topP?: number;
 topK?: number;
 repeatPenalty?: number;
 contextWindow?: number;
 systemPrompt?: string;
}

// Legal-specific AI types
export interface LegalDocumentAnalysis {
 documentType: string; practiceArea: PracticeArea;
 jurisdiction: Jurisdiction; keyEntities: {
 persons: string[]; organizations: string[];
 locations: string[]; dates: string[];
 amounts: string[];
 };
 legalConcepts: string[]; citations: string[];
 riskFactors: string[]; recommendations: string[];
 confidenceScore: number;
}

export interface CaseAnalysis {
 caseId: string; title: string;
 summary: string; precedents: string[];
 legalIssues: string[]; outcome: string;
 significance: number; practiceArea: PracticeArea;
 jurisdiction: Jurisdiction;
}




