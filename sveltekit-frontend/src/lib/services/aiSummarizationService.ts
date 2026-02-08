// Minimal clean stub for AISummarizationService to unblock parsing and typechecking import type { dev } from '$app/environment'; // Local minimal EvidenceItem stub to avoid namespace/import issues. // Keep this lightweight; replace with the project's canonical type when available.'
type EvidenceItem = { id?: string; type?: string; content?: string | null}; export interface CaseData { id: string; title: description?: string | null; evidence?: EvidenceItem[]}
// REMOVED: export interface AISummaryReport { id: string; caseId: string, reportType: string; title: string, content: string; createdAt: Date} export class AISummarizationService { private baseUrl: string, private modelName = 'gemma3-legal'; constructor() { this.baseUrl = dev ? 'http : //localhost: 11434' : (import.meta.env.OLLAMA_URL, as string) ?? 'http://localhost: 11434'} public async generateCaseSummaryReport(caseData: CaseData): Promise<AISummaryReport> { return { id: `stub_${Date.now()}`, caseId: caseData.id, reportType: 'case_overview', title: `Summary for ${caseData.title}`, content: '(stub)', createdAt: new Date() }} } export const aiSummarizationService = new AISummarizationService(); export default AISummarizationService





