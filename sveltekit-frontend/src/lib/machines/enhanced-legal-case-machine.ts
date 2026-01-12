/**
 * Enhanced Legal Case Machine - XState v5
 * RabbitMQ Background Job Handler for Comprehensive Case Management
 *
 * Queued via idle-detection-rabbitmq-machine for:
 * - Loading existing cases
 * - Creating new cases with validation
 * - Adding evidence and attachments
 * - Running AI analysis on case data
 */
import { assign, createMachine, fromPromise } from 'xstate';

export interface CaseForm {
	caseNumber?: string;
	title: string;
	description?: string;
	priority?: 'low' | 'medium' | 'high';
}

export interface LegalCase extends CaseForm {
	id: string;
	createdAt?: number;
	updatedAt?: number;
}

export interface Evidence {
	id: string;
	title: string;
	description: string;
	fileUrl?: string;
	uploadedAt?: number;
}

export type EvidenceInput = Omit<Evidence, 'id' | 'uploadedAt'>;

export interface AIAnalysisResult {
	summary: string;
	keyFindings?: string[];
	recommendations?: string[];
	confidence: number;
}

export interface EnhancedLegalCaseContext {
	currentCase: LegalCase | null;
	evidenceList: Evidence[];
	aiAnalysis: {
		status: 'idle' | 'processing' | 'completed' | 'failed';
		results?: AIAnalysisResult;
	};
	formData: Partial<CaseForm>;
	validationErrors: Record<string, string[]>;
	loading: boolean;
	error: string | null;
	jobId?: string; // RabbitMQ job identifier
	sessionId?: string; // User session for job tracking
}

export type EnhancedLegalCaseEvent =
	| { type: 'LOAD_CASE'; caseId: string }
	| { type: 'CREATE_CASE'; data: CaseForm }
	| { type: 'ADD_EVIDENCE'; caseId: string; evidence: EvidenceInput }
	| { type: 'START_AI_ANALYSIS'; caseId: string }
	| { type: 'RESET' };

const initialContext: EnhancedLegalCaseContext = {
	currentCase: null,
	evidenceList: [],
	aiAnalysis: { status: 'idle' },
	formData: {},
	validationErrors: {},
	loading: false,
	error: null
};

export const enhancedLegalCaseMachine = createMachine(
	{
		id: 'enhancedLegalCase',
		initial: 'initializing',
		types: {} as {
			context: EnhancedLegalCaseContext,
			events: EnhancedLegalCaseEvent,
		},
		context: initialContext,
		states: {
			initializing: {
				entry: assign({ loading: () => true }),
				invoke: {
					src: 'initializeSystem',
					onDone: {
						target: 'idle',
						actions: assign({ loading: () => false })
					},
					onError: {
						target: 'systemError',
						actions: assign({
							loading: () => false,
							error: () => 'Initialization failed'
						})
					}
				}
			},
			idle: {
				on: {
					LOAD_CASE: 'loadingCase',
					CREATE_CASE: 'creatingCase',
					ADD_EVIDENCE: 'addingEvidence',
					START_AI_ANALYSIS: 'startingAnalysis'
				}
			},
			loadingCase: {
				entry: assign({ loading: () => true }),
				invoke: {
					src: 'loadCase',
					input: ({ event }) => ({ caseId: (event as Extract<EnhancedLegalCaseEvent, { type: 'LOAD_CASE' }>).caseId }),
					onDone: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							currentCase: ({ event }) => event.output.case,
							evidenceList: ({ event }) => event.output.evidence || []
						})
					},
					onError: {
						target: 'idle',
						actions: assign({
							loading: () => false,
							error: () => 'Failed to load case'
						})
					}
				}
			},
			caseLoaded: {
				on: {
					ADD_EVIDENCE: 'addingEvidence',
					START_AI_ANALYSIS: 'startingAnalysis',
					RESET: 'idle'
				}
			},
			creatingCase: {
				entry: assign({ loading: () => true }),
				invoke: {
					src: 'createCase',
					input: ({ event }) => ({ data: (event as Extract<EnhancedLegalCaseEvent, { type: 'CREATE_CASE' }>).data }),
					onDone: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							currentCase: ({ event }) => event.output
						})
					},
					onError: {
						target: 'idle',
						actions: assign({
							loading: () => false,
							error: () => 'Failed to create case'
						})
					}
				}
			},
			addingEvidence: {
				entry: assign({ loading: () => true }),
				invoke: {
					src: 'addEvidence',
					input: ({ event }) => {
						const e = event as Extract<EnhancedLegalCaseEvent, { type: 'ADD_EVIDENCE' }>;
						return { caseId: e.caseId, evidence: e.evidence };
					},
					onDone: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							evidenceList: ({ context, event }) => [...context.evidenceList, event.output]
						})
					},
					onError: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							error: () => 'Failed to add evidence'
						})
					}
				}
			},
			startingAnalysis: {
				entry: assign({
					loading: () => true,
					aiAnalysis: ({ context }) => ({
						...context.aiAnalysis,
						status: 'processing' as const
					})
				}),
				invoke: {
					src: 'startAIAnalysis',
					input: ({ event }) => ({ caseId: (event as Extract<EnhancedLegalCaseEvent, { type: 'START_AI_ANALYSIS' }>).caseId }),
					onDone: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							aiAnalysis: ({ event }) => ({
								status: 'completed' as const,
								results: event.output
							})
						})
					},
					onError: {
						target: 'caseLoaded',
						actions: assign({
							loading: () => false,
							aiAnalysis: ({ context }) => ({
								...context.aiAnalysis,
								status: 'failed' as const
							}),
							error: () => 'AI analysis failed'
						})
					}
				}
			},
			systemError: {
				on: {
					RESET: 'initializing'
				}
			}
		}
	},
	{
		actors: {
			initializeSystem: fromPromise<{ status: string }, void>(async () => {
				// Initialize database connections, check system health
				return { status: 'ok' };
			}),
			loadCase: fromPromise<
				{ case: LegalCase; evidence: Evidence[] },
				{ input: { caseId: string } }
			>(async ({ input }) => {
				const response = await fetch(`/api/cases/${input.caseId}`);
				if (!response.ok) throw new Error('Failed to load case');
				const data = await response.json();
				return {
					case: data.case,
					evidence: data.evidence || []
				};
			}),
			createCase: fromPromise<LegalCase, { input: { data: CaseForm } }>(
				async ({ input }) => {
					const response = await fetch('/api/cases', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(input.data)
					});
					if (!response.ok) throw new Error('Failed to create case');
					return response.json();
				}
			),
			addEvidence: fromPromise<
				Evidence,
				{ input: { caseId: string; evidence: EvidenceInput } }
			>(async ({ input }) => {
				const response = await fetch(`/api/cases/${input.caseId}/evidence`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(input.evidence)
				});
				if (!response.ok) throw new Error('Failed to add evidence');
				return response.json();
			}),
			startAIAnalysis: fromPromise<AIAnalysisResult, { input: { caseId: string } }>(
				async ({ input }) => {
					const response = await fetch(`/api/cases/${input.caseId}/analyze`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' }
					});
					if (!response.ok) throw new Error('AI analysis failed');
					return response.json();
				}
			)
		}
	}
);

export default enhancedLegalCaseMachine;






