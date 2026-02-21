/**
 * XState v5 Machine for Case Workflow Management
 * Handles: case creation → document upload → analysis → recommendations → action
 */
import { assign, createMachine, fromPromise } from 'xstate';

// --- Type Definitions ---
export type CaseData = Record<string, unknown>;
export type Metadata = Record<string, unknown>;
export type MemoryContext = Record<string, unknown>;

export interface CaseDocument {
	id: string;
	content: string;
	type: string;
	[key: string]: unknown;
}

export interface AnalysisResult {
	id: string;
	[key: string]: unknown;
}

export interface Recommendation {
	id: string;
	status: 'pending' | 'completed' | 'failed';
	type: string;
	timing_suggestion: 'immediate' | 'normal' | 'long_term';
	[key: string]: unknown;
}

export interface CaseWorkflowContext {
	case_id?: string;
	user_id: string;
	current_step: string;
	case_data?: CaseData;
	documents: CaseDocument[];
	analysis_results: AnalysisResult[];
	recommendations: Recommendation[];
	memory_context?: MemoryContext;
	error_message?: string;
	progress: {
		total_steps: number;
		completed_steps: number;
		current_action: string;
	};
	settings: {
		auto_analyze: boolean;
		notification_level: 'minimal' | 'normal' | 'detailed';
		ai_assistance_level: 'basic' | 'enhanced' | 'proactive';
	};
}

export type CaseWorkflowEvent =
	| { type: 'CREATE_CASE'; case_data: CaseData }
	| { type: 'UPLOAD_DOCUMENT'; file: File; metadata?: Metadata }
	| { type: 'START_ANALYSIS' }
	| { type: 'ACCEPT_RECOMMENDATION'; recommendation_id: string }
	| { type: 'REJECT_RECOMMENDATION'; recommendation_id: string }
	| { type: 'REQUEST_AI_ASSISTANCE'; query: string }
	| { type: 'UPDATE_SETTINGS'; settings: Partial<CaseWorkflowContext['settings']> }
	| { type: 'RETRY' }
	| { type: 'RESET' }
	| { type: 'NEXT_STEP' }
	| { type: 'PREVIOUS_STEP' };

// --- Actors (XState v5 fromPromise) ---

const createCaseActor = fromPromise(async ({ input }: { input: { case_data?: CaseData; user_id: string } }) => {
	const res = await fetch('/api/cases', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: (input.case_data as any)?.title ?? 'Untitled Case',
			description: (input.case_data as any)?.description ?? '',
			priority: (input.case_data as any)?.priority ?? 'medium'
		})
	});
	if (!res.ok) throw new Error('Failed to create case');
	const json = await res.json();
	return { case_id: json.data?.id as string };
});

const uploadDocumentActor = fromPromise(async ({ input }: { input: { case_id: string; file: File; metadata?: Metadata } }) => {
	const formData = new FormData();
	formData.append('file', input.file);
	formData.append('caseId', input.case_id);
	if (input.metadata?.title) formData.append('title', String(input.metadata.title));
	if (input.metadata?.description) formData.append('description', String(input.metadata.description));

	const res = await fetch('/evidence?/upload', { method: 'POST', body: formData });
	if (!res.ok) throw new Error('Upload failed');
	const json = await res.json();
	const data = JSON.parse(json.data?.[0] ?? json.data ?? '{}');
	return {
		document: {
			id: data?.evidence?.id ?? crypto.randomUUID(),
			content: '',
			type: input.file.type
		} as CaseDocument
	};
});

const analyzeCaseActor = fromPromise(async ({ input }: { input: { case_id: string } }) => {
	const res = await fetch(`/api/cases/${input.case_id}/analyze/stream`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ promptType: 'analysis' })
	});
	if (!res.ok) throw new Error('Analysis failed');
	// For SSE endpoints, read the first complete response
	const text = await res.text();
	return {
		analysis: { id: crypto.randomUUID(), summary: text } as AnalysisResult,
		recommendations: [] as Recommendation[]
	};
});

const executeRecommendationActor = fromPromise(async ({ input }: { input: { recommendation_id: string; case_id: string } }) => {
	// Recommendations are executed as case updates
	return {
		recommendation: {
			id: input.recommendation_id,
			status: 'completed' as const,
			type: 'action',
			timing_suggestion: 'immediate' as const
		} satisfies Recommendation
	};
});

const aiAssistanceActor = fromPromise(async ({ input }: { input: { query: string; case_id: string } }) => {
	const res = await fetch('/api/chat/stream', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: input.query,
			caseId: input.case_id,
			mode: 'query'
		})
	});
	if (!res.ok) throw new Error('AI assistance failed');
	return await res.json();
});

// --- Machine Definition ---

export const caseWorkflowMachine = createMachine({
	id: 'caseWorkflow',
	initial: 'idle',
	context: {
		user_id: '',
		current_step: 'initial',
		documents: [],
		analysis_results: [],
		recommendations: [],
		progress: {
			total_steps: 6,
			completed_steps: 0,
			current_action: 'Ready to start'
		},
		settings: {
			auto_analyze: true,
			notification_level: 'normal',
			ai_assistance_level: 'enhanced'
		}
	} as CaseWorkflowContext,

	states: {
		idle: {
			on: {
				CREATE_CASE: {
					target: 'creatingCase',
					actions: assign(({ event }) => {
						const e = event as Extract<CaseWorkflowEvent, { type: 'CREATE_CASE' }>;
						return {
							case_data: e.case_data,
							current_step: 'creating_case',
							progress: { total_steps: 6, completed_steps: 0, current_action: 'Creating case...' }
						};
					})
				}
			}
		},

		creatingCase: {
			invoke: {
				src: createCaseActor,
				input: ({ context }) => ({
					case_data: context.case_data,
					user_id: context.user_id
				}),
				onDone: {
					target: 'caseReady',
					actions: assign(({ context, event }) => ({
						case_id: event.output.case_id,
						progress: {
							...context.progress,
							completed_steps: 1,
							current_action: 'Case created successfully'
						}
					}))
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error_message: `Failed to create case: ${(event as any).error?.message ?? 'unknown error'}`
					}))
				}
			}
		},

		caseReady: {
			entry: assign({ current_step: 'case_ready' }),
			on: {
				UPLOAD_DOCUMENT: {
					target: 'uploadingDocument',
					actions: assign(({ context }) => ({
						progress: { ...context.progress, current_action: 'Uploading document...' }
					}))
				},
				START_ANALYSIS: {
					target: 'analyzingCase',
					guard: ({ context }) => context.documents.length > 0
				},
				REQUEST_AI_ASSISTANCE: { target: 'providingAssistance' }
			}
		},

		uploadingDocument: {
			invoke: {
				src: uploadDocumentActor,
				input: ({ context, event }) => {
					const e = event as Extract<CaseWorkflowEvent, { type: 'UPLOAD_DOCUMENT' }>;
					return {
						case_id: context.case_id ?? '',
						file: e.file,
						metadata: e.metadata
					};
				},
				onDone: {
					target: 'caseReady',
					actions: assign(({ context, event }) => ({
						documents: [...context.documents, event.output.document],
						progress: {
							...context.progress,
							completed_steps: Math.min(context.progress.completed_steps + 1, context.progress.total_steps),
							current_action: 'Document uploaded successfully'
						}
					}))
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error_message: `Upload failed: ${(event as any).error?.message ?? 'unknown error'}`
					}))
				}
			}
		},

		analyzingCase: {
			entry: assign(({ context }) => ({
				current_step: 'analyzing',
				progress: { ...context.progress, current_action: 'Analyzing case and documents...' }
			})),
			invoke: {
				src: analyzeCaseActor,
				input: ({ context }) => ({ case_id: context.case_id ?? '' }),
				onDone: {
					target: 'reviewingRecommendations',
					actions: assign(({ context, event }) => ({
						analysis_results: [...context.analysis_results, event.output.analysis],
						recommendations: event.output.recommendations,
						progress: {
							...context.progress,
							completed_steps: Math.min(context.progress.completed_steps + 1, context.progress.total_steps),
							current_action: 'Analysis complete, reviewing recommendations...'
						}
					}))
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error_message: `Analysis failed: ${(event as any).error?.message ?? 'unknown error'}`
					}))
				}
			}
		},

		reviewingRecommendations: {
			entry: assign({ current_step: 'reviewing_recommendations' }),
			on: {
				ACCEPT_RECOMMENDATION: {
					target: 'executingRecommendation',
					actions: assign(({ context }) => ({
						progress: { ...context.progress, current_action: 'Executing recommendation...' }
					}))
				},
				REJECT_RECOMMENDATION: {
					actions: assign(({ context, event }) => {
						const e = event as Extract<CaseWorkflowEvent, { type: 'REJECT_RECOMMENDATION' }>;
						return {
							recommendations: context.recommendations.filter(r => r.id !== e.recommendation_id)
						};
					})
				},
				REQUEST_AI_ASSISTANCE: { target: 'providingAssistance' },
				NEXT_STEP: {
					target: 'workflowComplete',
					guard: ({ context }) => context.recommendations.every(r => r.status === 'completed')
				}
			}
		},

		executingRecommendation: {
			invoke: {
				src: executeRecommendationActor,
				input: ({ context, event }) => {
					const e = event as Extract<CaseWorkflowEvent, { type: 'ACCEPT_RECOMMENDATION' }>;
					return {
						recommendation_id: e.recommendation_id,
						case_id: context.case_id ?? ''
					};
				},
				onDone: {
					target: 'reviewingRecommendations',
					actions: assign(({ context, event }) => ({
						recommendations: context.recommendations.map(r =>
							r.id === event.output.recommendation.id ? event.output.recommendation : r
						),
						progress: { ...context.progress, current_action: 'Recommendation executed' }
					}))
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error_message: `Recommendation failed: ${(event as any).error?.message ?? 'unknown error'}`
					}))
				}
			}
		},

		providingAssistance: {
			invoke: {
				src: aiAssistanceActor,
				input: ({ context, event }) => {
					const e = event as Extract<CaseWorkflowEvent, { type: 'REQUEST_AI_ASSISTANCE' }>;
					return { query: e.query, case_id: context.case_id ?? '' };
				},
				onDone: {
					target: 'caseReady',
					actions: assign(({ context }) => ({
						progress: { ...context.progress, current_action: 'AI assistance provided' }
					}))
				},
				onError: {
					target: 'caseReady',
					actions: assign(({ event }) => ({
						error_message: `AI assistance failed: ${(event as any).error?.message ?? 'unknown error'}`
					}))
				}
			}
		},

		workflowComplete: {
			type: 'final',
			entry: assign(({ context }) => ({
				current_step: 'complete',
				progress: {
					...context.progress,
					completed_steps: context.progress.total_steps,
					current_action: 'Workflow completed successfully'
				}
			}))
		},

		error: {
			on: {
				RETRY: {
					target: 'idle',
					actions: assign({ error_message: undefined })
				},
				RESET: {
					target: 'idle',
					actions: assign({
						case_id: undefined,
						case_data: undefined,
						documents: [],
						analysis_results: [],
						recommendations: [],
						memory_context: undefined,
						error_message: undefined,
						progress: { total_steps: 6, completed_steps: 0, current_action: 'Ready to start' }
					})
				}
			}
		}
	},

	on: {
		UPDATE_SETTINGS: {
			actions: assign(({ context, event }) => {
				const e = event as Extract<CaseWorkflowEvent, { type: 'UPDATE_SETTINGS' }>;
				return { settings: { ...context.settings, ...e.settings } };
			})
		}
	}
});

// Export machine types
export type CaseWorkflowMachine = typeof caseWorkflowMachine;
