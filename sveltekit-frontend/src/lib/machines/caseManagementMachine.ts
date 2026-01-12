// @ts-nocheck - XState v5 assign() typing is overly restrictive
/**
 * XState Machine for Case Management
 * Uses MCP Tools Layer for all database operations
 */
import { assign, fromPromise, setup, type StateFrom } from 'xstate';

// Simple type aliases for now
type CaseData = any;
type EvidenceData = any;

// Machine Context
export interface CaseManagementContext {
	// Current case data
	currentCase: CaseData | null;
	cases: CaseData[]; evidence: EvidenceData[];
	// Search and filters
	searchQuery: string; searchResults: CaseData[];
	filters: {
		status?: string;
		priority?: string;
		dateRange?: { from: Date;
			to: Date;
		};
	};
	// UI state
	selectedCaseId: string | null;
	isLoading: boolean; error: string | null;
	// Pagination
	pagination: { page: number;
		limit: number; totalCount: number;
	};
	// User context
	userId: string;
}

// Machine Events
type CaseManagementEvent =
	| { type: 'LOAD_CASE'; caseId: string }
	| { type: 'CREATE_CASE'; caseData: Omit<CaseData, 'id' | 'createdAt' | 'updatedAt'> }
	| { type: 'UPDATE_CASE'; caseId: string; updates: Partial<CaseData> }
	| { type: 'DELETE_CASE'; caseId: string }
	| { type: 'ADD_EVIDENCE'; caseId: string; evidence: Omit<EvidenceData, 'id' | 'createdAt'> }
	| { type: 'SEARCH_CASES'; query: string }
	| { type: 'LOAD_USER_CASES'; userId: string }
	| { type: 'SET_FILTERS'; filters: Partial<CaseManagementContext['filters']> }
	| { type: 'SET_PAGE'; page: number }
	| { type: 'SELECT_CASE'; caseId: null }
	| { type: 'CLEAR_ERROR' }
	| { type: 'RETRY' };

// Machine Services (MCP Tool Calls) - XState v5 pattern
const caseManagementServices = {
	loadCase: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const caseId = event.caseId ?? context.selectedCaseId;
		if (!caseId) throw new Error('No case ID provided');
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.loadCase',
				args: { caseId },
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to load case: ${response.statusText}`);
		}
		return await response.json();
	},
	createCase: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.createCase',
				args: { caseData: { ...event.caseData, userId: context.userId },
				},
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to create case: ${response.statusText}`);
		}
		return await response.json();
	},
	updateCase: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.updateCase',
				args: { caseId: event.caseId, ...event.updates },
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to update case: ${response.statusText}`);
		}
		return await response.json();
	},
	addEvidence: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.addEvidence',
				args: { caseId: event.caseId, evidence: event.evidence },
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to add evidence: ${response.statusText}`);
		}
		return await response.json();
	},
	searchCases: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.searchCases',
				args: { query: event.query || context.searchQuery,
					userId: context.userId,
					filters: context.filters,
				},
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to search cases: ${response.statusText}`);
		}
		return await response.json();
	},
	loadUserCases: async ({ input }: { input: { context: CaseManagementContext; event: any } }) => {
		const { context: event } = input;
		const response = await fetch('/api/v1/mcp/call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: 'cases.getUserCases',
				args: { userId: event.userId || context.userId,
					options: { limit: context.pagination.limit,
						offset: (context.pagination.page - 1) * context.pagination.limit,
						status: context.filters.status,
					},
				},
			}),
		});
		if (!response.ok) {
			throw new Error(`Failed to load user cases: ${response.statusText}`);
		}
		return await response.json();
	},
};

// XState Machine Definition (v5 with setup pattern)
export const caseManagementMachine: any = setup({
	types: { context: {} as CaseManagementContext,
		events: {} as CaseManagementEvent,
	},
	actors: { loadCase: fromPromise(caseManagementServices.loadCase),
		createCase: fromPromise(caseManagementServices.createCase),
		updateCase: fromPromise(caseManagementServices.updateCase),
		addEvidence: fromPromise(caseManagementServices.addEvidence),
		searchCases: fromPromise(caseManagementServices.searchCases),
		loadUserCases: fromPromise(caseManagementServices.loadUserCases),
	},
}).createMachine({
	id: 'caseManagement',
	initial: 'idle',
	context: { currentCase: null,
		cases: [],
		evidence: [],
		searchQuery: '',
		searchResults: [],
		filters: {},
		selectedCaseId: null,
		isLoading: false,
		error: null,
		pagination: { page: 1, limit: 20, totalCount: 0 },
		userId: '', // Will be set when machine is spawned
	},
	states: { idle: {
			on: { LOAD_CASE: 'loadingCase',
				CREATE_CASE: 'creatingCase',
				UPDATE_CASE: 'updatingCase',
				ADD_EVIDENCE: 'addingEvidence',
				SEARCH_CASES: 'searchingCases',
				LOAD_USER_CASES: 'loadingUserCases',
				SET_FILTERS: { target: 'idle',
					actions: assign({ filters: ({ context, event }) => ({ ...context.filters, ...event.filters }),
					}),
				},
				SET_PAGE: { target: 'loadingUserCases',
					actions: assign({ pagination: ({ context, event }) => ({ ...context.pagination, page: event.page }),
					}),
				},
				SELECT_CASE: { target: 'idle',
					actions: assign({ selectedCaseId: ({ event }) => event.caseId,
					}),
				},
				CLEAR_ERROR: { target: 'idle',
					actions: assign({ error: null }),
				},
			},
		},
		loadingCase: { entry: assign({ isLoading: true, error: null }),
			invoke: { src: 'loadCase',
				input: ({ context, event }) => ({ context, event }),
				onDone: { target: 'idle',
					actions: assign({ currentCase: ({ event }) => event.output.result,
						selectedCaseId: ({ event }) => event.output.result?.id,
						isLoading: false,
					}),
				},
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Failed to load case',
						isLoading: false,
					}),
				},
			},
		},
		creatingCase: { entry: assign({ isLoading: true, error: null }),
			invoke: { src: 'createCase',
				input: ({ context, event }) => ({ context, event }),
				onDone: [
					{
						target: 'loadingUserCases',
						guard: ({ event }) => event.output.success,
						actions: assign({ isLoading: false,
							selectedCaseId: ({ event }) => event.output.caseId,
						}),
					},
					{
						target: 'idle',
						actions: assign({ error: ({ event }) => event.output.error || 'Failed to create case',
							isLoading: false,
						}),
					}],
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Failed to create case',
						isLoading: false,
					}),
				},
			},
		},
		updatingCase: { entry: assign({ isLoading: true, error: null }),
			invoke: { src: 'updateCase',
				input: ({ context, event }) => ({ context, event }),
				onDone: [
					{
						target: 'loadingCase',
						guard: ({ event }) => event.output.success,
						actions: assign({ isLoading: false,
						}),
					},
					{
						target: 'idle',
						actions: assign({ error: ({ event }) => event.output.error || 'Failed to update case',
							isLoading: false,
						}),
					}],
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Failed to update case',
						isLoading: false,
					}),
				},
			},
		},
		addingEvidence: { entry: assign({ isLoading: true, error: null }),
			invoke: { src: 'addEvidence',
				input: ({ context, event }) => ({ context, event }),
				onDone: [
					{
						target: 'loadingCase',
						guard: ({ event }) => event.output.success,
						actions: assign({ isLoading: false,
						}),
					},
					{
						target: 'idle',
						actions: assign({ error: ({ event }) => event.output.error || 'Failed to add evidence',
							isLoading: false,
						}),
					}],
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Failed to add evidence',
						isLoading: false,
					}),
				},
			},
		},
		searchingCases: { entry: assign({
				isLoading: true,
				error: null,
				searchQuery: ({ event }) => event.query || '',
			}),
			invoke: { src: 'searchCases',
				input: ({ context, event }) => ({ context, event }),
				onDone: { target: 'idle',
					actions: assign({ searchResults: ({ event }) => event.output.cases || [],
						pagination: ({ context, event }) => ({
							...context.pagination,
							totalCount: event.output.totalCount || 0,
						}),
						isLoading: false,
					}),
				},
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Search failed',
						searchResults: [],
						isLoading: false,
					}),
				},
			},
		},
		loadingUserCases: { entry: assign({ isLoading: true, error: null }),
			invoke: { src: 'loadUserCases',
				input: ({ context, event }) => ({ context, event }),
				onDone: { target: 'idle',
					actions: assign({ cases: ({ event }) => event.output.cases || [],
						pagination: ({ context, event }) => ({
							...context.pagination,
							totalCount: event.output.totalCount || 0,
						}),
						isLoading: false,
					}),
				},
				onError: { target: 'idle',
					actions: assign({ error: ({ event }) => (event.error as Error)?.message ?? 'Failed to load cases',
						cases: [],
						isLoading: false,
					}),
				},
			},
		},
		error: { on: {
				RETRY: 'idle',
				CLEAR_ERROR: { target: 'idle',
					actions: assign({ error: null }),
				},
			},
		},
	},
}) as any;

// Export types
export type CaseManagementState = StateFrom<typeof caseManagementMachine>;




