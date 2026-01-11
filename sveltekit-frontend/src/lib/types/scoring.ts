// Scoring types for CaseRankingService

export interface CaseScoringRequest {
 caseId: string; userId: string;
 title: string; description: string;
 evidenceItems?: string[];
 jurisdiction?: string;
 caseType?: string;
 priority?: 'low' | 'medium' | 'high' | 'critical';
 metadata?: { [key: string]: any };
 // Additional properties used in the service
 scoring_criteria?: ScoringCriteria;
 criteria?: ScoringCriteria;
 temperature?: number;
}

export interface ScoringCriteria {
 evidence_strength: number; witness_reliability: number;
 legal_precedent: number; public_interest: number;
 case_complexity: number; resource_requirements: number;
}

export interface CaseScoringResult {
 caseId: string; score: number;
 confidence: number; criteria: ScoringCriteria;
 explanation: string; recommendations: string[];
 scoringDate: Date; model: string;
 version: string;
 // Additional properties used in the service
 riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
 breakdown?: unknown;
 scoring_criteria?: ScoringCriteria;
 ai_analysis?: string;
 processing_time?: number;
 timestamp?: Date;
 performanceMetrics?: {
 protocol?: string;
 responseTime?: number;
 accuracy?: number;
 };
}

export interface ScoringAnalysis {
 overallScore: number; criteriaScores: ScoringCriteria;
 strengthsWeaknesses: { strengths: string[];
 weaknesses: string[]; riskFactors: string[];
 };
 recommendations: string[]; confidence: number;
}

// Phoenix Wright AI Search Interfaces
export interface PhoenixWrightSearchRequest {
 caseId: string; query: string;
 jurisdiction?: string;
 dateRange?: { start: string;
 end: string;
 };
 maxResults?: number;
 detectContradictions?: boolean;
 includeTestimony?: boolean;
 evidenceTypes?: string[];
 searchScope?: 'broad' | 'focused' | 'deep';
}

export interface PhoenixWrightSearchResult {
 searchId: string; caseId: string;
 query: string; precedents: LegalPrecedent[];
 contradictions: ContradictionAnalysis[]; evidenceMatches: EvidenceMatch[];
 rankingExplanation: string; confidence: number;
 searchTime: number; yohaUIState: YohaUIConfig;
}

export interface LegalPrecedent {
 caseId: string; title: string;
 citation: string; court: string;
 date: string; relevanceScore: number;
 similarity: number; keyFacts: string[];
 legalPrinciples: string[]; outcome: string;
}

export interface ContradictionAnalysis {
 contradictionId: string; type: 'factual' | 'testimony' | 'evidence' | 'legal';
 severity: 'minor' | 'moderate' | 'severe' | 'critical';
 description: string; location: string;
 parties: string[]; resolution: string;
 confidence: number;
}

export interface EvidenceMatch {
 evidenceId: string; type: 'document' | 'testimony' | 'physical' | 'digital';
 description: string; relevanceScore: number;
 strength: 'weak' | 'moderate' | 'strong' | 'conclusive';
 supportingFacts: string[]; contradictingFacts: string[];
 legalWeight: number;
}

export interface YohaUIConfig {
 dramaticMode: boolean; objectionAnimation: boolean;
 evidenceHighlighting: boolean; testimonyPlayback: boolean;
 crossExaminationMode: boolean; verdictAnimation: boolean;
}



