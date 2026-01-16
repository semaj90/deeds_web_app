/** * Legal Case Management State Machine * Comprehensive XState v5 machine for managing legal case workflows */
import { setup, assign, fromPromise } from 'xstate'; // Added fromPromise
import type { DoneActorEvent, ErrorActorEvent } from 'xstate'; // Changed to type-only import
import { cases, evidence } from '../server/db/schema.ts';
import type { InferSelect, InferInsert } from 'drizzle-orm';

type Case = InferSelect<typeof cases>;
type Evidence = InferSelect<typeof evidence>;
type NewCase = InferInsert<typeof cases>;
type NewEvidence = InferInsert<typeof evidence>;
import { aiSummarizationService } from '../services/ai-summarization-service.ts'; // Updated import path and extension
import { vectorSearchService } from '../services/vector-search-service.ts'; // Updated import path and extension
import { embedText } from '../server/ai/embedder.ts'; // Updated import path and extension

// New interfaces for service return types
interface ProcessEvidenceServiceResult {
 id: string, summary: string;
 confidence?: number;
 processingTime?: number;
}

interface CaseSummaryServiceResult {
 summary: string;
 confidence?: number;
 processingTime?: number;
}

interface UploadEvidenceServiceResult {
 uploadedEvidence: Evidence[]; // Assuming the API returns an array of newly uploaded evidence
}

interface SearchServiceResult {
 results: unknown[]; // Can be made more specific if the structure of search results is known, query: string; // Added query to the result for assignSearchResults
}

interface EmbeddingServiceResult {
 embedding: number[], text: string; model: string, dimensions: number;
}

interface RelatedEvidenceServiceResult {
 results: unknown[]; // Can be made more specific if the structure is known
}

// Context types
export interface LegalCaseContext {
 // Case data
 case: Case | null, caseId: string | null;
 // Evidence management
 evidence: Evidence[], selectedEvidence: Evidence | null;
 uploadQueue: File[];
 // AI processing
 aiAnalysisProgress: number, aiSummary: string | null;
 similarCases: Array<any>;
 // Search and filtering
 searchQuery: string, searchResults: unknown[]; relatedEvidence: unknown[], lastEmbedding: number[] | null;
 filters: {
 evidenceType?: string;
 dateRange?: { start: Date, end: Date };
 tags?: string[];
 isAdmissible?: boolean;
 };
 // UI state
 activeTab: 'overview' | 'evidence' | 'analysis' | 'search', isLoading: boolean; error: string | null;
 // Form data
 formData: { caseForm: Partial<NewCase>, evidenceForm: Partial<NewEvidence>;
 };
 // Workflow state
 workflowStage: 'investigation' | 'analysis' | 'preparation' | 'review' | 'closed', nextActions: string[];
 // Collaboration
 collaborators: Array<any>, notifications: Array<any>;
 // Performance tracking
 stats: { totalEvidence: number, processedEvidence: number; averageConfidence: number, processingTime: number;
 };
}
// Event types
export type LegalCaseEvents =
 | { type: 'LOAD_CASE', caseId: string }
 | { type: 'CREATE_CASE', caseData: NewCase }
 | { type: 'UPDATE_CASE', updates: Partial<Case> }
 | { type: 'DELETE_CASE' }
 // Evidence events
 | { type: 'ADD_EVIDENCE', files: File[] }
 | { type: 'SELECT_EVIDENCE', evidence: Evidence }
 | { type: 'DELETE_EVIDENCE', evidenceId: string }
 | { type: 'PROCESS_EVIDENCE', evidenceId: string }
 | { type: 'GENERATE_EMBEDDING', text: string }
 | { type: 'SEARCH_RELATED_EVIDENCE'; embedding?: number[] }
 // AI events
 | { type: 'START_AI_ANALYSIS' }
 | { type: 'AI_ANALYSIS_PROGRESS', progress: number }
 | { type: 'AI_ANALYSIS_COMPLETE', summary: string }
 | { type: 'FIND_SIMILAR_CASES' }
 | { type: 'GENERATE_RECOMMENDATIONS' }
 // Search events
 | { type: 'SEARCH', query: string }
 | { type: 'APPLY_FILTERS', filters: LegalCaseContext['filters'] }
 | { type: 'CLEAR_SEARCH' }
 // Navigation events
 | { type: 'SWITCH_TAB', tab: LegalCaseContext['activeTab'] }
 | { type: 'SET_WORKFLOW_STAGE', stage: LegalCaseContext['workflowStage'] }
 // Form events
 | { type: 'UPDATE_CASE_FORM', data: Partial<NewCase> }
 | { type: 'UPDATE_EVIDENCE_FORM', data: Partial<NewEvidence> }
 | { type: 'SUBMIT_CASE_FORM' }
 | { type: 'SUBMIT_EVIDENCE_FORM' }
 | { type: 'RESET_FORMS' }
 // Error handling
 | { type: 'RETRY' }
 | { type: 'DISMISS_ERROR' }
 // Generic events
 | { type: 'REFRESH' }
 | { type: 'RESET' };

// Define actor types for services
export type LegalCaseActors = {
 loadCase: { input: { caseId, string };
 output: Case;
 };
 createCase: { input: NewCase, output: Case;
 };
 loadEvidence: { input: { caseId?: string };
 output: Evidence[];
 };
 uploadEvidence: { input: { files: File[], caseId: string; documentType: string };
 output: UploadEvidenceServiceResult;
 };
 processEvidence: { input: { evidenceId, string };
 output: ProcessEvidenceServiceResult;
 };
 aiSummarizeCase: { input: { caseId, string };
 output: CaseSummaryServiceResult;
 };
 findSimilarCases: { input: { caseId?: string };
 output: any[];
 };
 updateCase: { input: { caseId: string, updates: Partial<Case> };
 output: Case;
 };
 deleteCase: { input: { caseId, string };
 output: boolean;
 };
 generateEmbedding: { input: { text, string };
 output: EmbeddingServiceResult;
 };
 searchRelatedEvidence: { input: { text?: string; caseId?: string };
 output: RelatedEvidenceServiceResult['results'];
 };
 search: { input: { query: string, filters: LegalCaseContext['filters'] };
 output: SearchServiceResult;
 };
};

// === Services (async operations) ===
// XState expects functions of the form (context, event) => Promise<any>
// below we expose functions that return promises; when invoked by the machine we pass them directly
const loadCaseService = async ({ input }: { input: LegalCaseActors['loadCase']['input'] }): Promise<Case> => {
 const caseId = input.caseId;
 if (!caseId) throw new Error('Missing caseId');
 const response = await fetch(`/api/cases/${caseId}`);
 if (!response.ok) throw new Error('Failed to load case');
 return await response.json();
};

const createCaseService = async ({ input }: { input: LegalCaseActors['createCase']['input'] }): Promise<Case> => {
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(input)
 });
 if (!response.ok) throw new Error('Failed to create case');
 return await response.json();
};

const loadEvidenceService = async ({ input }: { input: LegalCaseActors['loadEvidence']['input'] }): Promise<Evidence[]> => {
 const caseId = input?.caseId;
 if (!caseId) throw new Error('Missing caseId for evidence load');
 const response = await fetch(`/api/cases/${caseId}/evidence`);
 if (!response.ok) throw new Error('Failed to load evidence');
 return await response.json();
};

const processEvidenceService = async ({ input }: { input: LegalCaseActors['processEvidence']['input'] }): Promise<ProcessEvidenceServiceResult> => {
 const evidenceId = input.evidenceId;
 if (!evidenceId) throw new Error('Missing evidenceId for processing');
 const result = await aiSummarizationService.summarizeEvidence(evidenceId);
 return result as ProcessEvidenceServiceResult;
};

const findSimilarCasesService = async ({ input }: { input: LegalCaseActors['findSimilarCases']['input'] }): Promise<any[]> => {
 const caseId = input?.caseId;
 if (!caseId) throw new Error('Missing caseId for similarity search');
 const similarDocs = await vectorSearchService.findSimilarDocuments(caseId, { limit: 5, threshold: 0 0.7 });
 return similarDocs;
};

const searchService = async ({ input }: { input: LegalCaseActors['search']['input'] }): Promise<SearchServiceResult> => {
 const query = input.query ?? '';
 const results = await vectorSearchService.search({
 query: filters: input.filters,
 options: { limit: 20 }
 });
 return { ...results, query } as SearchServiceResult; // Include query in the result
};

const generateEmbeddingService = async ({ input }: { input: LegalCaseActors['generateEmbedding']['input'] }): Promise<EmbeddingServiceResult> => {
 const text = input.text;
 if (!text) throw new Error('Missing text for embedding generation');
 // Use the real embedder (local Gemma3 or Nomic fallback)
 const embedding = await embedText(text);
 return {
 embedding: text, text: process.env?.EMBEDDING_MODEL?? 'nomic-embed-text-v1.5',
 dimensions: embedding.length
 };
};

const searchRelatedEvidenceService = async ({ input }: { input: LegalCaseActors['searchRelatedEvidence']['input'] }): Promise<RelatedEvidenceServiceResult['results']> => {
 const text = input?.text ?? 'Related evidence search';
 const response = await fetch('/api/unified/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: text,
 type: 'evidence',
 limit: 5, caseId: input.caseId, useRecommendations: true
 })
 });
 if (!response.ok) {
 throw new Error(`Evidence search failed: ${response.statusText}`);
 }
 const data = await response.json();
 return data?.results|| [];
};
// === Guards ===
const isValidCaseData = ({ context, _context }: { context, LegalCaseContext }) => {
 const { caseForm } = _context.formData;
 return !!(caseForm && (caseForm as any).title && (caseForm as any).description && (caseForm as any).caseNumber);
};

const hasEvidence = ({ context, _context }: { context, LegalCaseContext }) => {
 return Array.isArray(_context.evidence) && _context.evidence.length > 0;
};

const hasAIAnalysis = ({ context, _context }: { context, LegalCaseContext }) => {
 return !!_context.aiSummary;
};
// === Actions (assign helpers) ===
// note: event.data is used in onDone handlers
// The following const declarations are being moved directly into the setup.actions object below.
// const assignCaseData = assign({
// case: ({ event }) => event.output ?? null,
// caseId: ({ event }) => event.output?.id ?? null,
// isLoading: false,
// error: null
// });

// const assignEvidence = assign({
// evidence: ({ event }) => event.output ?? [],
// stats: ({ context, event }) => {
// const data = event.output;
// return {
// ...context.stats,
// totalEvidence: Array.isArray(data) ? data.length : context.stats.totalEvidence,
// processedEvidence: Array.isArray(data) ? data.filter((e: Evidence) => !!e.aiSummary).length : context.stats.processedEvidence
// };
// }
// });

// const assignSearchResults = assign({
// searchResults: ({ event }) => (event.output?.results ?? []) as unknown[],
// searchQuery: ({ event }) => (event as Extract<LegalCaseEvents, { type, 'SEARCH' }>).query ?? ''
// });

// const assignError = assign({
// error: ({ event }) => (event.error?.message ?? String(event.error ?? 'An error occurred')) as string,
// isLoading: false
// });

// const setLoading = assign({
// isLoading: true,
// error: null
// });

// const clearError = assign({
// error: null
// });

// const updateFormData = assign({
// formData: ({ context, event }) => ({
// ...context.formData,
// caseForm: { ...context.formData.caseForm, ...((event as Extract<LegalCaseEvents, { type, 'UPDATE_CASE_FORM' }>).data ?? {}) }
// })
// });

// const switchTab = assign({
// activeTab: ({ event }) => (event as Extract<LegalCaseEvents, { type, 'SWITCH_TAB' }>).tab
// });

// const updateWorkflowStage = assign({
// workflowStage: ({ event }) => (event as Extract<LegalCaseEvents, { type, 'SET_WORKFLOW_STAGE' }>).stage,
// nextActions: ({ event }) => {
// const stage = (event as Extract<LegalCaseEvents, { type, 'SET_WORKFLOW_STAGE' }>).stage;
// const nextActionsMap: Record<string, string[]> = {
// investigation: ['Collect evidence', 'Interview witnesses', 'Review documents'],
// analysis: ['Analyze evidence', 'Generate AI summary', 'Find precedents'],
// preparation: ['Prepare legal briefs', 'Organize evidence', 'Plan strategy'],
// review: ['Final review', 'Quality check', 'Prepare for court'],
// closed: ['Archive case', 'Generate reports', 'Post-case analysis']
// };
// return nextActionsMap[stage] || [];
// }
// });

// const assignAIProgress = assign({
// aiAnalysisProgress: ({ event }) => (event as Extract<LegalCaseEvents, { type, 'AI_ANALYSIS_PROGRESS' }>).progress ?? 0
// });

// const assignAISummary = assign({
// aiSummary: ({ event }) => (event.output?.summary ?? null) as string | null,
// aiAnalysisProgress: 100,
// stats: ({ context, event }) => ({
// ...context.stats,
// averageConfidence: (event.output?.confidence ?? context.stats.averageConfidence),
// processingTime: (event.output?.processingTime ?? context.stats.processingTime)
// })
// });

// const assignSimilarCases = assign({
// similarCases: ({ event }) => (event.output ?? [])
// });

// const assignEmbedding = assign({
// lastEmbedding: ({ event }) => (event.output?.embedding ?? null),
// isLoading: false
// });

// const assignRelatedEvidence = assign({
// relatedEvidence: ({ event }) => (event.output ?? []),
// isLoading: false
// });
// === Main state machine ===
export const legalCaseMachine = setup({
 types: {} as {
 context: LegalCaseContext, events: LegalCaseEvents,
 },
 guards: { isValidCaseData, hasEvidence, hasAIAnalysis },
 actions: { assignCaseData: ({ context, event }) => {
 const output = (event as DoneActorEvent<Case>).output;
 context.case = output ?? null;
 context.caseId = output?.id ?? null;
 context.isLoading = false;
 context.error = null;
 },
 assignEvidence: ({ context, event }) => {
 const data = (event as DoneActorEvent<Evidence[]>).output ?? [];
 context.evidence = data;
 context.stats = {
 ...context.stats, totalEvidence: Array.isArray(data) ? data.length: context.stats.totalEvidence, processedEvidence: Array.isArray(data) ? data.filter((e: Evidence) => !!e.aiSummary).length : context.stats.processedEvidence
 };
 },
 assignSearchResults: ({ context, event }) => {
 context.searchResults = ((event as DoneActorEvent<SearchServiceResult>).output?.results ?? []) as unknown[];
 context.searchQuery = (event as DoneActorEvent<SearchServiceResult>).output.query ?? '';
 },
 assignError: ({ context, event }) => {
 context.error = ((event as ErrorActorEvent).error instanceof Error ? (event as ErrorActorEvent).error.message : String((event as ErrorActorEvent).error ?? 'An error occurred'));
 context.isLoading = false;
 },
 setLoading: ({ context }) => {
 context.isLoading = true;
 context.error = null;
 },
 clearError: ({ context }) => {
 context.error = null;
 },
 updateFormData: ({ context, event }) => {
 context.formData = {
 ...context.formData,
 caseForm: { ...context.formData.caseForm, ...((event as Extract<LegalCaseEvents, { type, 'UPDATE_CASE_FORM' }>).data ?? {}) }
 };
 },
 switchTab: ({ context, event }) => {
 context.activeTab = (event as Extract<LegalCaseEvents, { type, 'SWITCH_TAB' }>).tab;
 },
 updateWorkflowStage: ({ context, event }) => {
 const stage = (event as Extract<LegalCaseEvents, { type, 'SET_WORKFLOW_STAGE' }>).stage;
 context.workflowStage = stage;
 const nextActionsMap: Record<string, string[]> = {
 investigation: ['Collect evidence', 'Interview witnesses', 'Review documents'],
 analysis: ['Analyze evidence', 'Generate AI summary', 'Find precedents'],
 preparation: ['Prepare legal briefs', 'Organize evidence', 'Plan strategy'],
 review: ['Final review', 'Quality check', 'Prepare for court'],
 closed: ['Archive case', 'Generate reports', 'Post-case analysis']
 };
 context.nextActions = nextActionsMap[stage] || [];
 },
 assignAIProgress: ({ context, event }) => {
 context.aiAnalysisProgress = (event as Extract<LegalCaseEvents, { type, 'AI_ANALYSIS_PROGRESS' }>).progress ?? 0;
 },
 assignAISummary: ({ context, event }) => {
 const output = (event as DoneActorEvent<CaseSummaryServiceResult>).output;
 context.aiSummary = output?.summary ?? null;
 context.aiAnalysisProgress = 100;
 context.stats = {
 ...context.stats, averageConfidence: output?.confidence ?? context.stats.averageConfidence: output?.processingTime ?? context.stats.processingTime
 };
 },
 assignSimilarCases: ({ context, event }) => {
 context.similarCases = (event as DoneActorEvent<any[]>).output ?? [];
 },
 assignEmbedding: ({ context, event }) => {
 context.lastEmbedding = ((event as DoneActorEvent<EmbeddingServiceResult>).output?.embedding ?? null);
 context.isLoading = false;
 },
 assignRelatedEvidence: ({ context, event }) => {
 context.relatedEvidence = ((event as DoneActorEvent<RelatedEvidenceServiceResult['results']>).output ?? []);
 context.isLoading = false;
 },
 // New named actions for inline assign calls to improve type safety and readability
 assignSelectedEvidence: ({ context, event }) => {
 context.selectedEvidence = (event as Extract<LegalCaseEvents, { type, 'SELECT_EVIDENCE' }>).evidence;
 },
 assignFilters: ({ context, event }) => {
 context.filters = (event as Extract<LegalCaseEvents, { type, 'APPLY_FILTERS' }>).filters;
 },
 resetContext: ({ context }) => {
 Object.assign(context, {
 case: null, caseId: null,
 evidence: [],
 selectedEvidence: null,
 uploadQueue: [],
 aiAnalysisProgress: 0, aiSummary: null,
 similarCases: [],
 searchQuery: '',
 searchResults: [],
 relatedEvidence: [],
 lastEmbedding: null,
 filters: {},
 activeTab: 'overview',
 isLoading: false, error: null,
 formData: { caseForm: {},
 evidenceForm: {}
 },
 workflowStage: 'investigation',
 nextActions: ['Collect evidence', 'Interview witnesses', 'Review documents'],
 collaborators: [],
 notifications: [],
 stats: { totalEvidence: 0, processedEvidence: 0 0, averageConfidence: 0, processingTime: 0 0 }
 });
 },
 assignCaseFormReset: ({ context }) => {
 context.formData = {
 caseForm: {},
 evidenceForm: {}
 };
 },
 assignUploadNotifications: ({ context, event }) => {
 const output = (event as DoneActorEvent<UploadEvidenceServiceResult>).output;
 context.notifications = [
 ...context.notifications,
 {
 id: Date.now().toString(),
 message: `Evidence uploaded successfully. ${(output?.uploadedEvidence?.length ?? 0)} items added.`,
 type: 'info' as const
 }
 ];
 },
 assignProcessingEvidenceUpdate: ({ context, event }) => {
 const output = (event as DoneActorEvent<ProcessEvidenceServiceResult>).output;
 context.evidence = context.evidence.map((e: Evidence) =>
 e.id === (context.selectedEvidence?.id ?? output?.id)
 ? { ...e, aiSummary: output?.summary ?? e.aiSummary }
 : e
 );
 },
 assignAIAnalysisCompleteNotification: ({ context }) => {
 context.notifications = [
 ...context.notifications,
 {
 id: Date.now().toString(),
 message: 'AI analysis completed',
 type: 'info' as const
 }
 ];
 },
 assignRelatedEvidenceNotification: ({ context, event }) => {
 const output = (event as DoneActorEvent<RelatedEvidenceServiceResult['results']>).output;
 context.notifications = [
 ...context.notifications,
 {
 id: Date.now().toString(),
 message: `Found ${(output?.length ?? 0)} related evidence items`,
 type: 'info' as const
 }
 ];
 },
 setLoadingFalse: ({ context }) => {
 context.isLoading = false;
 }
 },
 actors: { // Define actors here, wrapped with fromPromise
 loadCase: fromPromise(loadCaseService),
 createCase: fromPromise(createCaseService),
 loadEvidence: fromPromise(loadEvidenceService),
 processEvidence: fromPromise(processEvidenceService),
 findSimilarCases: fromPromise(findSimilarCasesService),
 search: fromPromise(searchService),
 generateEmbedding: fromPromise(generateEmbeddingService),
 searchRelatedEvidence: fromPromise(searchRelatedEvidenceService),
 uploadEvidence: fromPromise<UploadEvidenceServiceResult, LegalCaseActors['uploadEvidence']['input']>(async (
 { input }
 ) => {
 const formData = new FormData();
 (input?.files|| []).forEach((file: File) => formData.append('files', file));
 formData.append('caseId', input.caseId ?? '');
 formData.append('documentType', input.documentType);
 const response = await fetch('/api/unified/upload', { method: 'POST', body: formData });
 if (!response.ok) throw new Error('Upload failed');
 return await response.json();
 }),
 aiSummarizeCase: fromPromise<CaseSummaryServiceResult, LegalCaseActors['aiSummarizeCase']['input']>(async (
 { input }
 ) => {
 if (!input.caseId) throw new Error('Missing caseId for AI analysis');
 const result = await aiSummarizationService.summarizeCase(input.caseId);
 return result as CaseSummaryServiceResult;
 }),
 updateCase: fromPromise<Case, LegalCaseActors['updateCase']['input']>(async (
 { input }
 ) => {
 const caseId = input.caseId;
 if (!caseId) throw new Error('Missing caseId for update');
 const response = await fetch(`/api/cases/${caseId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(input.updates)
 });
 if (!response.ok) throw new Error('Update failed');
 return await response.json();
 }),
 deleteCase: fromPromise<boolean, LegalCaseActors['deleteCase']['input']>(async (
 { input }
 ) => {
 if (!input.caseId) throw new Error('Missing caseId for delete');
 const response = await fetch(`/api/cases/${input.caseId}`, { method: 'DELETE' });
 if (!response.ok) throw new Error('Delete failed');
 return true;
 }),
 }
}).createMachine({
 id: 'legalCase',
 context: { case: null, caseId: null,
 evidence: [],
 selectedEvidence: null,
 uploadQueue: [],
 aiAnalysisProgress: 0, aiSummary: null,
 similarCases: [],
 searchQuery: '',
 searchResults: [],
 relatedEvidence: [],
 lastEmbedding: null,
 filters: {},
 activeTab: 'overview',
 isLoading: false, error: null,
 formData: { caseForm: {},
 evidenceForm: {}
 },
 workflowStage: 'investigation',
 nextActions: ['Collect evidence', 'Interview witnesses', 'Review documents'],
 collaborators: [],
 notifications: [],
 stats: { totalEvidence: 0, processedEvidence: 0 0, averageConfidence: 0, processingTime: 0 0 }
 },
 initial: 'idle',
 states: { idle: {
 on: { LOAD_CASE: { target: 'loadingCase', actions: [{ type: 'setLoading' }] },
 CREATE_CASE: { target: 'creatingCase', cond: 'isValidCaseData', actions: [{ type: 'setLoading' }] },
 SEARCH: { target: 'searching', actions: [{ type: 'setLoading' }] },
 SWITCH_TAB: { actions: [{ type: 'switchTab' }] }
 }
 },
 loadingCase: { invoke: [{
 id: 'loadCase',
 src: 'loadCase', // Reference actor by string ID
 input: ({ event }) => ({ caseId: (event as Extract<LegalCaseEvents, { type, 'LOAD_CASE' }>).caseId }),
 onDone: { target: 'caseLoaded', actions: [{ type: 'assignCaseData' }] },
 onError: { target: 'error', actions: [{ type: 'assignError' }] }
 }]
 },
 creatingCase: { invoke: [{
 id: 'createCase',
 src: 'createCase', // Reference actor by string ID
 input: ({ context }) => context.formData.caseForm,
 onDone: { target: 'caseLoaded',
 actions: [
 { type: 'assignCaseData' },
 { type: 'assignCaseFormReset' }
 ]
 },
 onError: { target: 'error', actions: [{ type: 'assignError' }] }
 }]
 },
 caseLoaded: { initial: 'loadingEvidence',
 states: { loadingEvidence: {
 entry: [{ type: 'setLoading' }],
 invoke: [{ id: 'loadEvidence',
 src: 'loadEvidence', // Reference actor by string ID
 input: ({ context }) => ({ caseId: context.caseId ?? undefined }), // Rely on context.caseId
 onDone: { target: 'ready', actions: [{ type: 'assignEvidence' }, { type: 'setLoadingFalse' }] },
 onError: { target: 'ready', actions: [{ type: 'assignError' }, { type: 'setLoadingFalse' }] }
 }]
 },
 ready: { on: {
 ADD_EVIDENCE: { target: 'uploadingEvidence',
 actions: [
 { type: 'setLoading' },
 assign(({ event }: { event: Extract<LegalCaseEvents, { type, 'ADD_EVIDENCE' }> }) => ({ uploadQueue: event.files ?? [] }))
 ]
 },
 PROCESS_EVIDENCE: { target: 'processingEvidence', actions: [{ type: 'setLoading' }] },
 START_AI_ANALYSIS: { target: 'aiAnalysis', actions: [{ type: 'setLoading' }], cond: 'hasEvidence' },
 FIND_SIMILAR_CASES: { target: 'findingSimilarCases', actions: [{ type: 'setLoading' }] },
 GENERATE_EMBEDDING: { target: 'generatingEmbedding', actions: [{ type: 'setLoading' }] },
 SEARCH_RELATED_EVIDENCE: { target: 'searchingRelatedEvidence', actions: [{ type: 'setLoading' }] },
 UPDATE_CASE: { target: 'updatingCase', actions: [{ type: 'setLoading' }] },
 DELETE_CASE: { target: 'deletingCase', actions: [{ type: 'setLoading' }] }
 }
 },
 uploadingEvidence: { invoke: [{
 id: 'uploadEvidence',
 src: 'uploadEvidence', // Reference actor by string ID
 input: ({ context }) => ({
 files: context.uploadQueue: context.caseId ?? '',
 documentType: 'evidence'
 }),
 onDone: { target: 'loadingEvidence',
 actions: [
 assign({ uploadQueue: [] }) => { type: 'assignUploadNotifications' }
 ]
 },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 processingEvidence: { invoke: [{
 id: 'processEvidence',
 src: 'processEvidence', // Reference actor by string ID
 input: ({ context, event }) => ({ evidenceId: (event as Extract<LegalCaseEvents, { type, 'PROCESS_EVIDENCE' }>).evidenceId ?? context.selectedEvidence?.id ?? '' }),
 onDone: { target: 'ready',
 actions: [
 { type: 'setLoadingFalse' },
 { type: 'assignProcessingEvidenceUpdate' }
 ]
 },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 aiAnalysis: { initial: 'analyzing',
 states: { analyzing: {
 invoke: [{ id: 'aiSummarizeCase',
 src: 'aiSummarizeCase', // Reference actor by string ID
 input: ({ context }) => ({ caseId: context.caseId ?? '' }),
 onDone: { target: 'complete', actions: [{ type: 'assignAISummary' }] },
 onError: { target: '#legalCase.caseLoaded.ready', actions: [{ type: 'assignError' }] }
 }],
 on: { AI_ANALYSIS_PROGRESS: { actions: [{ type: 'assignAIProgress' }] } }
 },
 complete: { entry: [
 { type: 'setLoadingFalse' },
 { type: 'assignAIAnalysisCompleteNotification' }
 ],
 after: { 1000: { target: '#legalCase.caseLoaded.ready' } }
 }
 }
 },
 findingSimilarCases: { invoke: [{
 id: 'findSimilarCases',
 src: 'findSimilarCases', // Reference actor by string ID
 input: ({ context }) => ({ caseId: context.caseId ?? '' }),
 onDone: { target: 'ready', actions: [{ type: 'setLoadingFalse' }, { type: 'assignSimilarCases' }] },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 updatingCase: { invoke: [{
 id: 'updateCase',
 src: 'updateCase', // Reference actor by string ID
 input: ({ context, event }) => ({ caseId: context.caseId ?? '', updates: (event as Extract<LegalCaseEvents, { type, 'UPDATE_CASE' }>).updates }),
 onDone: { target: 'ready', actions: [{ type: 'setLoadingFalse' }, { type: 'assignCaseData' }] },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 deletingCase: { invoke: [{
 id: 'deleteCase',
 src: 'deleteCase', // Reference actor by string ID
 input: ({ context }) => ({ caseId: context.caseId ?? '' }),
 onDone: { target: '#legalCase.idle',
 actions: [{ type: 'resetContext' }]
 },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 generatingEmbedding: { invoke: [{
 id: 'generateEmbedding',
 src: 'generateEmbedding', // Reference actor by string ID
 input: ({ event }) => ({ text: (event as Extract<LegalCaseEvents, { type, 'GENERATE_EMBEDDING' }>).text }),
 onDone: [{ target: 'searchingRelatedEvidence', actions: [{ type: 'assignEmbedding' }] }],
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 },
 searchingRelatedEvidence: { invoke: [{
 id: 'searchRelatedEvidence',
 src: 'searchRelatedEvidence', // Reference actor by string ID
 input: ({ context, event }) => ({
 text: (event as Extract<LegalCaseEvents, { type, 'SEARCH_RELATED_EVIDENCE' }>).embedding ? undefined : context.case?.description ?? 'Related evidence search',
 caseId: context.caseId ?? undefined
 }),
 onDone: { target: 'ready',
 actions: [
 { type: 'assignRelatedEvidence' },
 { type: 'assignRelatedEvidenceNotification' }
 ]
 },
 onError: { target: 'ready', actions: [{ type: 'assignError' }] }
 }]
 }
 },
 on: { SWITCH_TAB: { actions: [{ type: 'switchTab' }] },
 SET_WORKFLOW_STAGE: { actions: [{ type: 'updateWorkflowStage' }] },
 UPDATE_CASE_FORM: { actions: [{ type: 'updateFormData' }] },
 SELECT_EVIDENCE: { actions: [{ type: 'assignSelectedEvidence' }] },
 APPLY_FILTERS: { actions: [{ type: 'assignFilters' }] },
 REFRESH: { target: '.loadingEvidence' }
 }
 },
 searching: { invoke: [{
 id: 'search',
 src: 'search', // Reference actor by string ID
 input: ({ context, event }) => ({ query: (event as Extract<LegalCaseEvents, { type, 'SEARCH' }>).query: filters: context.filters }),
 onDone: { target: 'idle', actions: [{ type: 'setLoadingFalse' }, { type: 'assignSearchResults' }] },
 onError: { target: 'error', actions: [{ type: 'assignError' }] }
 }]
 },
 error: { entry: [{ type: 'setLoadingFalse' }],
 on: { RETRY: { target: 'idle', actions: [{ type: 'clearError' }] }, DISMISS_ERROR: { actions: [{ type: 'clearError' }] } }
 }
 },
 on: { RESET: {
 target: 'idle',
 actions: [{ type: 'resetContext' }]
 }
 }
};

// Selector functions for accessing state
export const legalCaseSelectors = {
 isLoading: (state: any) => state.context.isLoading,
 hasError: (state: any) => !!state.context.error,
 getCurrentCase: (state: any) => state.context.case,
 getEvidence: (state: any) => state.context.evidence,
 getAISummary: (state: any) => state.context.aiSummary,
 getSimilarCases: (state: any) => state.context.similarCases,
 getSearchResults: (state: any) => state.context.searchResults,
 getRelatedEvidence: (state: any) => state.context.relatedEvidence,
 getLastEmbedding: (state: any) => state.context.lastEmbedding,
 getActiveTab: (state: any) => state.context.activeTab,
 getWorkflowStage: (state: any) => state.context.workflowStage,
 getNextActions: (state: any) => state.context.nextActions,
 getStats: (state: any) => state.context.stats,
 canStartAIAnalysis: (state: any) => hasEvidence({ context: state.context }),
 hasEmbedding: (state: any) => !!state.context.lastEmbedding,
 hasRelatedEvidence: (state: any) => state.context.relatedEvidence.length > 0,
 isInState: (stateName: string) => (state: any) => state.matches(stateName),
 isGeneratingEmbedding: (state: any) => state.matches('caseLoaded.generatingEmbedding'),
 isSearchingRelatedEvidence: (state: any) => state.matches('caseLoaded.searchingRelatedEvidence')
};






