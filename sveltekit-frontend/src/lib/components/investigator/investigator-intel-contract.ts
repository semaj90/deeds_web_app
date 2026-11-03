export type PredictiveSignalV1 = string | {
  id: string;
  text: string;
  confidence?: 'high' | 'medium' | 'low';
  evidenceRefs?: string[];
};

export type InvestigatorIntelResponseV1 = {
  success: true;
  summary: string;
  recommendations: { title: string; rationale: string; confidence: string }[];
  didYouMean: string[];
  predictiveSignals: PredictiveSignalV1[];
  evidenceUsed?: number;
  provenance?: {
    source: 'MODEL' | 'CACHE' | 'FALLBACK';
    generatedAt?: string;
    caseEvidenceRevision?: string | null;
    graphRevision?: string | null;
  };
};

export function normalizeIntelSignals(signals: PredictiveSignalV1[]): Array<{
  id: string;
  text: string;
  confidence?: 'high' | 'medium' | 'low';
  evidenceRefs: string[];
}> {
  return signals.map((s, index) =>
    typeof s === 'string'
      ? { id: String(index), text: s, evidenceRefs: [] }
      : { ...s, evidenceRefs: s.evidenceRefs ?? [] }
  );
}
