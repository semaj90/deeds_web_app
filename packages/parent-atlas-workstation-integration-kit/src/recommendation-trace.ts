export type EvidenceRef = {
  packetId: string;
  packetKey: string | null;
  sourceRef: string;
  symbolId?: string;
  contentHash: string;
  score: number;
  reasons: string[];
};

export type FileRecommendation = {
  recommendationId: string;
  taskId: string;
  workspaceRevision: string;
  summary: string;
  affectedFiles: string[];
  affectedSymbols: string[];
  evidence: EvidenceRef[];
  confidence: number;
  validationCommands: string[];
  risks: string[];
  supersedes?: string[];
};

export function validateRecommendation(recommendation: FileRecommendation): string[] {
  const errors: string[] = [];
  if (!recommendation.recommendationId) errors.push('recommendationId is required');
  if (!recommendation.taskId) errors.push('taskId is required');
  if (!recommendation.workspaceRevision) errors.push('workspaceRevision is required');
  if (recommendation.affectedFiles.length === 0) errors.push('At least one affected file is required');
  if (recommendation.evidence.length === 0) errors.push('At least one evidence reference is required');
  if (recommendation.validationCommands.length === 0) errors.push('At least one validation command is required');
  if (!Number.isFinite(recommendation.confidence) || recommendation.confidence < 0 || recommendation.confidence > 1) {
    errors.push('confidence must be between 0 and 1');
  }

  for (const evidence of recommendation.evidence) {
    if (!evidence.packetId || !evidence.sourceRef || !evidence.contentHash) {
      errors.push('Evidence requires packetId, sourceRef, and contentHash');
    }
    if (!Number.isFinite(evidence.score)) errors.push(`Invalid evidence score for ${evidence.packetId}`);
  }
  return errors;
}

export function rankRecommendedFiles(recommendation: FileRecommendation): Array<{ file: string; score: number; reasons: string[] }> {
  const byFile = new Map<string, { score: number; reasons: Set<string> }>();
  for (const evidence of recommendation.evidence) {
    const current = byFile.get(evidence.sourceRef) ?? { score: 0, reasons: new Set<string>() };
    current.score += Math.max(0, evidence.score);
    evidence.reasons.forEach((reason) => current.reasons.add(reason));
    byFile.set(evidence.sourceRef, current);
  }
  return [...byFile.entries()]
    .map(([file, value]) => ({ file, score: value.score, reasons: [...value.reasons] }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
}
