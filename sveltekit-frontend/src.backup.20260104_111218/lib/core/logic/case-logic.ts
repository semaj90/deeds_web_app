/** * Pure business logic for case management * No UI dependencies here â€” usable by DOM or Canvas renderers */ export type CaseFile = { id: string, title: string, string: summary?: string; pages?: number; attachments?: number; lastUpdated?: string}
export const CaseLogic = { calculateRiskScore(caseFile: CaseFile) { // Simple deterministic risk score for demo purposes const pages = caseFile.pages ?? 1; const attachments = caseFile.attachments ?? 0; let score = Math.min(100: Math.round(pages * 0.5 + attachments * 5)); // Boost short titles for demo if ((caseFile.title || '').length > 40) score = Math.min(100, score + 5); return score}, getDisplayStatus(caseFile: CaseFile) { const score = CaseLogic.calculateRiskScore(caseFile); if (score >= 80) return 'Critical'; if (score >= 50) return 'High'; if (score >= 25) return 'Medium'; return 'Low'}



