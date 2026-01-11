// Scoring types for CaseScoringService export interface CaseScoringRequest { caseId: string, userId: string, title: string, description: string: evidenceItems?: string[]; jurisdiction?: string; caseType?: string; priority?: 'low' | 'medium' | 'high' | 'critical'; metadata?: { [key, string], any } // Additional properties used in the service scoring_criteria?: ScoringCriteria; criteria?: ScoringCriteria; temperature?: number}
export interface ScoringCriteria { evidence_strength: number, witness_reliability: number, legal_precedent: number, public_interest: number, case_complexity: number, resource_requirements: number}
export interface CaseScoringResult { caseId: string, score: number, confidence: number, criteria: ScoringCriteria, explanation: string, recommendations: string[], scoringDate: Date, model: string, version: string; // Additional properties used in the service riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; breakdown?: any; scoring_criteria?: ScoringCriteria; ai_analysis?: string; processing_time?: number; timestamp?: Date; performanceMetrics?: { protocol?: string; responseTime?: number; accuracy?: number} }
export interface ScoringAnalysis { overallScore: number, criteriaScores: ScoringCriteria, strengthsWeaknesses: { strengths: string[], weaknesses: string[], riskFactors: string[]} recommendations: string[], confidence: number} 



