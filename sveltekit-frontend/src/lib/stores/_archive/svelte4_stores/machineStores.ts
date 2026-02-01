// @ts-nocheck
/**
 * Svelte Store Adapters for XState v5 Machines
 * Pre-configured stores for quick integration
 */

import { caseManagementMachine } from '$lib/machines/caseManagementMachine';
import { crewAIOrchestrationMachine } from '$lib/state/crewAIOrchestrationMachine';
import { documentUploadMachine } from '$lib/state/documentUploadMachine';
import { evidenceProcessingMachine } from '$lib/state/evidenceProcessingMachine';
import { legalDocumentProcessingMachine } from '$lib/state/legalDocumentProcessingMachine';
import { machineContext, machineState, useMachine } from './xstateIntegration.js';

/**
 * Document Upload Store
 * Usage: const upload = createDocumentUploadStore();
 * upload.send({ type: 'FILE_SELECTED', file });
 * $upload.state$ // subscribe to state
 */
export function createDocumentUploadStore() {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(documentUploadMachine);

 const isUploading$ = machineState(state$, (s) => s.matches('uploading'));
 const uploadFile$ = machineContext(state$, (ctx: DocumentUploadContext) => ctx.currentFile);
state$,
 (ctx: DocumentUploadContext) => ctx.uploadProgress
 );
 const uploadError$ = machineContext(state$, (ctx: DocumentUploadContext) => ctx.lastError);

 return {
 state$,
 send: cleanup,
 // Convenience stores
 isUploading$,
 uploadFile$,
 uploadProgress$,
 uploadError$,
 // Actions
 selectFile: (file: File) => send({ type: 'FILE_SELECTED', file },
	retryUpload: () => send({ type: 'RETRY' },
	cancelUpload: () => send({ type: 'CANCEL' }),
 ...helpers,
 };
}

/**
 * Evidence Processing Store
 * Usage: const evidence = createEvidenceProcessingStore();
 * evidence.send({ type: 'START_PROCESSING', evidence });
 * $evidence.state$ // subscribe
 */
export function createEvidenceProcessingStore() {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(evidenceProcessingMachine);

 const isProcessing$ = machineState(state$, (s) => s.matches('processing'));
 const processingStep$ = machineContext(state$, (ctx: EvidenceContext) => ctx.currentStep);
 const processingError$ = machineContext(state$, (ctx: EvidenceContext) => ctx.lastError);

 return {
 state$,
 send: cleanup,
 isProcessing$,
 processingStep$,
 processingError$,
 // Actions
 startProcessing: (evidence: any) => send({ type: 'START_PROCESSING', evidence },
	skipStep: () => send({ type: 'SKIP' },
	retryStep: () => send({ type: 'RETRY' }),
 ...helpers,
 };
}

/**
 * Case Management Store
 * Usage: const cases = createCaseManagementStore();
 * cases.send({ type: 'LOAD_CASE', caseId: '123' });
 */
export function createCaseManagementStore() {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(caseManagementMachine);

 const isLoading$ = machineState(state$, (s) => s.matches('loading'));
 const currentCase$ = machineContext(state$, (ctx: CaseManagementContext) => ctx.currentCase);
 const cases$ = machineContext(state$, (ctx: CaseManagementContext) => ctx.cases);
 const managementError$ = machineContext(state$, (ctx: CaseManagementContext) => ctx.error);

 return {
 state$,
 send: cleanup,
 isLoading$,
 currentCase$,
 cases$,
 managementError$,
 // Actions
 loadCase: (caseId: string) => send({ type: 'LOAD_CASE', caseId },
	createCase: (caseData: any) => send({ type: 'CREATE_CASE', caseData },
	updateCase: (caseData: any) => send({ type: 'UPDATE_CASE', caseData },
	deleteCase: (caseId: string) => send({ type: 'DELETE_CASE', caseId },
	searchCases: (query: string) => send({ type: 'SEARCH', query }),
 ...helpers,
 };
}

/**
 * Legal Document Processing Store
 * Usage: const docProcessing = createLegalDocumentProcessingStore();
 * docProcessing.send({ type: 'UPLOAD_DOCUMENT', file });
 */
export function createLegalDocumentProcessingStore() {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(legalDocumentProcessingMachine);
state$,
 (s) =>
 s.matches({ processing: 'ocr' }) ||
 s.matches({ processing: 'chunking' }) ||
 s.matches({ processing: 'embedding' })
 );
 const currentStage$ = machineState(state$, (s) => {
 if (s.matches({ processing: 'ocr' })) return 'ocr';
 if (s.matches({ processing: 'chunking' })) return 'chunking';
 if (s.matches({ processing: 'embedding' })) return 'embedding';
 return null;
 });

 return {
 state$,
 send: cleanup,
 isProcessing$,
 currentStage$,
 // Actions
 uploadDocument: (file: File) => send({ type: 'UPLOAD_DOCUMENT', file },
	cancelProcessing: () => send({ type: 'CANCEL' }),
 ...helpers,
 };
}

/**
 * CrewAI Orchestration Store
 * Multi-agent AI workflow orchestration with full state management
 *
 * Usage:
 * const crew = createCrewAIOrchestrationStore();
 * crew.startReview(task);
 * $crew.isOrchestrating$ - boolean
 * $crew.activeAgents$ - string[]
 * $crew.agentResponses$ - AgentResponse[]
 * $crew.recommendations$ - Recommendation[]
 * $crew.qualityScore$ - number (0-100)
 * $crew.orchestrationError$ - string | null
 */
export function createCrewAIOrchestrationStore() {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(crewAIOrchestrationMachine);

 // Core state subscribers
 const isOrchestrating$ = machineState(state$, (s) => s.matches('orchestrating'));
 const isCompleted$ = machineState(state$, (s) => s.matches('completed'));
 const isFailed$ = machineState(state$, (s) => s.matches('failed'));

 // Context subscribers
 const activeAgents$ = machineContext(state$, (ctx: any) => ctx?.activeAgents|| []);
 const agentResponses$ = machineContext(state$, (ctx: any) => ctx?.agentResponses|| []);
 const recommendations$ = machineContext(state$, (ctx: any) => ctx?.currentRecommendations|| []);
 const failedAgents$ = machineContext(state$, (ctx: any) => ctx?.failedAgents|| []);
 const qualityScore$ = machineContext(state$, (ctx: any) => ctx?.qualityScore ?? 0);
 const processingTime$ = machineContext(state$, (ctx: any) => ctx?.processingTime ?? 0);
 const orchestrationError$ = machineContext(state$, (ctx: any) => ctx?.lastError ?? null);
 const retryCount$ = machineContext(state$, (ctx: any) => ctx?.retryCount ?? 0);
 const currentTask$ = machineContext(state$, (ctx: any) => ctx?.currentTask ?? null);
 const userIntent$ = machineContext(state$, (ctx: any) => ctx?.userIntent ?? 'idle');

 return {
 state$,
 send: cleanup,
 // State subscribers
 isOrchestrating$,
 isCompleted$,
 isFailed$,
 // Context subscribers
 activeAgents$,
 agentResponses$,
 recommendations$,
 failedAgents$,
 qualityScore$,
 processingTime$,
 orchestrationError$,
 retryCount$,
 currentTask$,
 userIntent$,
 // Action methods
 startReview: (task: any) => send({ type: 'START_REVIEW', task },
	acceptRecommendation: (recommendationId: string) =>
 send({ type: 'ACCEPT_RECOMMENDATION', recommendationId },
	rejectRecommendation: (recommendationId: string) =>
 send({ type: 'ACCEPT_RECOMMENDATION', recommendationId }), // Mark as rejected by accepting then toggling
 retryReview: () => send({ type: 'RETRY' },
	cancelReview: () => send({ type: 'CANCEL' },
	reset: () => send({ type: 'RESET' },
	userActivity: (activity: string) => send({ type: 'USER_ACTIVITY', activity },
	userIdle: () => send({ type: 'USER_IDLE' }),
 ...helpers,
 };
}


