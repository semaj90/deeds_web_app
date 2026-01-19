/**
 * XState Machine for AI Agent Shell with Production Go Services Integration
 */
import type { RAGResponse, UploadResponse } from '$lib/services/goServiceClient.js';
import { assign, createMachine } from 'xstate';

// Define context and event types
export interface AgentShellContext {
  input: string; response: string;
  jobId?: string;
  rating?: number;
  searchQuery?: string;
  searchResults?: RAGResponse;
  uploadResults?: UploadResponse;
  userId?: string;
  caseId?: string;
  serviceHealth?: { enhancedRAG: boolean; uploadService: boolean; kratosServer: boolean;
  };
}

export type AgentShellEvent =
| { type: 'PROMPT'; input: string; userId?: string; caseId?: string }
  | { type: 'xstate.done.actor.callAgent'; data: string }
  | { type: 'ACCEPT_PATCH'; jobId: string; userId: string; patchContent: string }
  | { type: 'RATE_SUGGESTION'; jobId: string; rating: number; userId: string; feedback?: string }
  | { type: 'SEMANTIC_SEARCH'; query: string; userId: string; caseId?: string }
  | { type: 'FILE_UPLOAD'; file: File; userId: string; caseId?: string }
  | { type: 'CHECK_HEALTH' };

export const agentShellMachine = createMachine({
  id: 'agentShell',
  initial: 'idle',
  context: { input: '',
    response: '',
  } as AgentShellContext,
  types: {} as {
    context: AgentShellContext, events: AgentShellEvent,
  },
  states: { idle: { on: { PROMPT: { target: 'processing',
          actions: assign({ input: ({ event }) => (event as any).input ?? '',
            userId: ({ event }) => (event as any).userId,
            caseId: ({ event }) => (event as any).caseId,
          }),
        },
        SEMANTIC_SEARCH: { target: 'searching',
          actions: assign({ searchQuery: ({ event }) => (event as any).query,
            userId: ({ event }) => (event as any).userId,
            caseId: ({ event }) => (event as any).caseId,
          }),
        },
        FILE_UPLOAD: { target: 'uploading',
          actions: assign({ userId: ({ event }) => (event as any).userId,
            caseId: ({ event }) => (event as any).caseId,
          }),
        },
        CHECK_HEALTH: { target: 'checkingHealth',
        },
      },
    },
    processing: { invoke: { src: 'callAgent',
        input: ({ context }) => ({
          input: context.input,
          userId: context.userId,
          caseId: context.caseId,
        }),
        onDone: { target: 'idle',
          actions: assign({ response: ({ event }) => (event as any).output ?? '',
          }),
        },
        onError: 'idle',
      },
      on: { ACCEPT_PATCH: { actions: 'acceptPatchAction',
        },
        RATE_SUGGESTION: { actions: 'rateSuggestionAction',
        },
      },
    },
    searching: { invoke: { src: 'performSemanticSearch',
        input: ({ context }) => ({
          query: context.searchQuery,
          userId: context.userId,
          caseId: context.caseId,
        }),
        onDone: { target: 'idle',
          actions: assign({ searchResults: ({ event }) => (event as any).output ?? null,
          }),
        },
        onError: 'idle',
      },
    },
    uploading: { invoke: { src: 'performFileUpload',
        input: ({ context, event }) => ({
          file: (event as any).file,
          userId: context.userId,
          caseId: context.caseId,
        }),
        onDone: { target: 'idle',
          actions: assign({ uploadResults: ({ event }) => (event as any).output ?? null,
          }),
        },
        onError: 'idle',
      },
    },
    checkingHealth: {
      invoke: {
        src: 'checkServiceHealth',
        onDone: {
          target: 'idle',
          actions: assign({
            serviceHealth: ({ event }) => (event as any).output ?? null
          })
        },
        onError: 'idle'
      }
    },
  },
});

// Service implementations for XState with Production Services
export const agentShellServices = {
	callAgent: async ({
		input,
		userId,
		caseId
	}: { input: string;
		userId?: string;
		caseId?: string;
	}) => {
		try {
			// Placeholder for production service call
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input, userId, caseId })
			});
			const data = await response.json();
			return data?.response ?? 'No response';
		} catch (error) {
			console.error('Agent call failed:', error);
			throw error;
		}
	},

	performSemanticSearch: async ({
		query,
		userId,
		caseId
	}: { query: string;
		userId?: string;
		caseId?: string;
	}) => {
		try {
			const response = await fetch('/api/rag/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query, userId, caseId })
			});
			return await response.json();
		} catch (error) {
			console.error('Semantic search failed:', error);
			throw error;
		}
	},

	performFileUpload: async ({
		file,
		userId,
		caseId
	}: { file: File;
		userId?: string;
		caseId?: string;
	}) => {
		try {
			const formData = new FormData();
			formData.append('file', file);
			if (userId) formData.append('userId', userId);
			if (caseId) formData.append('caseId', caseId);

			const response = await fetch('/api/rag/upload', {
				method: 'POST',
				body: formData
			});
			return await response.json();
		} catch (error) {
			console.error('File upload failed:', error);
			throw error;
		}
	},

	checkServiceHealth: async () => {
		try {
			const response = await fetch('/api/health');
			return await response.json();
		} catch (error) {
			console.error('Health check failed:', error);
			throw error;
		}
	}
};

// Action implementations
export const agentShellActions = {
	acceptPatchAction: async ({ event }: { event, any }) => {
		try {
			const response = await fetch('/api/patches/accept', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jobId: event.jobId,
					userId: event.userId,
					patchContent: event.patchContent
				})
			});
			const result = await response.json();
			console.log('Patch accepted:', result);
		} catch (error) {
			console.error('Patch acceptance failed:', error);
		}
	},

	rateSuggestionAction: async ({ event }: { event, any }) => {
		try {
			const response = await fetch('/api/suggestions/rate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ jobId: event.jobId,
					rating: event.rating,
					userId: event.userId,
					feedback: event.feedback
				})
			});
			const result = await response.json();
			console.log('Rating submitted:', result);
		} catch (error) {
			console.error('Rating submission failed:', error);
		}
	}
};




