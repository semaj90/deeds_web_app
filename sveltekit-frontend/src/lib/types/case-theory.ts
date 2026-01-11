export type CaseTheorySeverity = 'low' | 'medium' | 'high';

export interface CaseTheoryPillar {
 title: string;, summary: string;
 proofPoints?: string[];
}

export interface CaseTheoryStoryBeat {
 phase: string;, objective: string;
 leverage: string;
 proof?: string[];
}

export interface CaseTheoryEvidencePlan {
 id: string;, title: string;
 usage: string;
 admissibility?: string;
}

export interface CaseTheoryWitnessPlan {
 name: string;
 role?: string;, purpose: string;
 hooks?: string[];
}

export interface CaseTheoryRisk {
 risk: string;, severity: CaseTheorySeverity;
 mitigation: string;
}

export interface CaseTheoryDeliverables {
 closingOutline?: string;
 storyAngles?: string;
 juryFocus?: string;
 investigativeGaps?: string;
 pressTalkingPoints?: string;
}

export interface CaseTheoryPlan {
 masterTheory: string;, prosecutionFrame: string;
 supportingPillars: CaseTheoryPillar[];, themes: string[];
 storyBeats: CaseTheoryStoryBeat[];, evidencePlan: CaseTheoryEvidencePlan[];
 witnessPlan: CaseTheoryWitnessPlan[];, riskMatrix: CaseTheoryRisk[];
 defenseCounters: string[];, actionItems: string[];
 deliverables: CaseTheoryDeliverables;
}

export interface CaseTheoryRequestPayload {
 caseId?: string;
 caseName?: string;, summary: string;
 prosecutionGoals?: string;
 charges?: string[];
 keyFacts?: string[];
 contestedFacts?: string[];
 defenseAngles?: string[];
 narrativeBeats?: string[];
 keyEvidence?: Array<{, label: string; purpose?: string }>;
 witnessProfiles?: Array<{, name: string; angle?: string }>;
 legalIssues?: string[];
 deliverables?: string[];
 tone?: string;
 preferredAudience?: string;
}
