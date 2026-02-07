
import { createMachine, assign, fromPromise, createActor } from 'xstate';
import type { productionServiceClient } from '$lib/api/production-service-client';

// Define missing types
interface LooseObject {
  [key: string]: unknown;
}

interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

// Legal AI Application State Machine - XState v5
export interface Case {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  assignedTo?: string;
  [key: string]: unknown;
}

export interface Evidence {
  id: string;
  caseId: string;
  type: string;
  description?: string;
  fileUrl?: string;
  metadata?: { [key: string]: unknown };
  [key: string]: unknown;
}

export interface Source {
  id: string;
  title: string;
  type: 'document' | 'case' | 'statute' | 'web_url';
  relevance: number;
  snippet?: string;
  url?: string;
}

export interface AIResponse {
  response: string;
  confidence: number;
  sources: Source[];
  timestamp: string;
  model: string;
  metadata: Record<string, unknown>;
}

export interface AuthResponse {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface RegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  [key: string]: unknown;
}

export interface LegalAIContext {
  user: {
    id: string | null;
    email: string | null;
    role: string | null;
    permissions: string[];
    isAuthenticated: boolean;
  };
  cases: {
    items: Case[];
    currentCase: Case | null;
    filters: { search: string; status: string; priority: string; category: string };
    pagination: { page: number; limit: number; total: number };
    loading: boolean;
    error: string | null;
  };
  ai: {
    isProcessing: boolean;
    currentQuery: string;
    lastResponse: AIResponse | null;
    error: string | null;
    models: { primary: string; embedding: string; available: string[] };
  };
  system: {
    connected: boolean;
    services: {
      database: boolean;
      redis: boolean;
      ollama: boolean;
      gpu: boolean;
      pgvector: boolean;
      qdrant: boolean;
      neo4j: boolean;
    };
    metrics: { errorCount: number; performanceScore: number; uptime: number };
  };
}

export type LegalAIEvent =
  | { type: 'AUTH.LOGIN'; credentials: { email: string; password: string } }
  | { type: 'AUTH.LOGOUT' }
  | { type: 'AUTH.REGISTER'; userData: RegistrationData }
  | { type: 'CASES.LOAD'; filters?: Partial<LegalAIContext['cases']['filters']> }
  | { type: 'CASES.SELECT'; case: Case }
  | { type: 'CASES.CREATE'; caseData: Partial<Case> }
  | { type: 'CASES.SEARCH'; query: string }
  | { type: 'AI.QUERY'; prompt: string; context?: Record<string, unknown> }
  | { type: 'SYSTEM.CHECK_STATUS' };

const initialContext: LegalAIContext = {
  user: { id: null, email: null, role: null, permissions: [], isAuthenticated: false },
  cases: {
    items: [],
    currentCase: null,
    filters: { search: '', status: 'all', priority: 'all', category: 'all' },
    pagination: { page: 1, limit: 10, total: 0 },
    loading: false,
    error: null,
  },
  ai: {
    isProcessing: false,
    currentQuery: '',
    lastResponse: null,
    error: null,
    models: {
      primary: 'gemma3-legal',
      embedding: 'nomic-embed-text',
      available: ['gemma3-legal', 'gpt4-legal', 'llama2-legal'],
    },
  },
  system: {
    connected: false,
    services: {
      database: false,
      redis: false,
      ollama: false,
      gpu: false,
      pgvector: false,
      qdrant: false,
      neo4j: false,
    },
    metrics: { errorCount: 0, performanceScore: 0, uptime: 0 },
  },
};

export const legalAIMachine = createMachine(
  {
    id: 'legalAI',
    initial: 'initializing',
    context: initialContext,
    states: {
      initializing: {
        invoke: {
          src: 'checkSystemStatus',
          onDone: { target: 'idle', actions: ['updateSystem'] },
          onError: { target: 'error', actions: ['setSystemError'] },
        },
      },
      idle: {
        on: {
          'AUTH.LOGIN': 'authenticating',
          'AUTH.REGISTER': 'registering',
          'CASES.LOAD': 'loadingCases',
          'CASES.CREATE': 'creatingCase',
          'AI.QUERY': 'processingAI',
          'SYSTEM.CHECK_STATUS': 'checkingStatus',
        },
      },
      authenticating: {
        invoke: {
          src: 'authenticateUser',
          input: ({ event }) => ({
            credentials: (event as Extract<LegalAIEvent, { type: 'AUTH.LOGIN' }>).credentials,
          }),
          onDone: { target: 'authenticated', actions: ['setUser'] },
          onError: { target: 'idle', actions: ['clearUser'] },
        },
      },
      authenticated: {
        initial: 'ready',
        states: {
          ready: {
            on: {
              'CASES.LOAD': '#legalAI.loadingCases',
              'AI.QUERY': '#legalAI.processingAI',
              'AUTH.LOGOUT': '#legalAI.idle',
            },
          },
        },
      },
      loadingCases: {
        invoke: {
          src: 'loadCases',
          input: ({ event }) => ({
            filters: (event as Extract<LegalAIEvent, { type: 'CASES.LOAD' }>).filters,
          }),
          onDone: { target: 'authenticated', actions: 'setCases' },
          onError: { target: 'authenticated' },
        },
      },
      processingAI: {
        entry: 'startAIProcessing',
        invoke: {
          src: 'processAIQuery',
          input: ({ event }) => ({
            prompt: (event as Extract<LegalAIEvent, { type: 'AI.QUERY' }>).prompt,
          }),
          onDone: { target: 'authenticated', actions: 'setAIResponse' },
          onError: { target: 'authenticated', actions: 'setAIError' },
        },
      },
      error: {
        on: {
          'SYSTEM.CHECK_STATUS': 'initializing',
        },
      },
      registering: {
        after: { 1000: 'idle' },
      },
      creatingCase: {
        after: { 1000: 'idle' },
      },
      checkingStatus: {
        after: { 1000: 'idle' },
      },
    },
  },
  {
    actions: {
      updateSystem: assign((_, event) => {
        const doneEvent = event as { output?: typeof initialContext.system } | undefined;
        return { system: doneEvent?.output ?? initialContext.system };
      }),
      setSystemError: assign((context) => ({
        system: { ...context.system, connected: false },
      })),
      setUser: assign((_, event) => {
        const doneEvent = event as { output?: AuthResponse } | undefined;
        const out = doneEvent?.output;
        return {
          user: {
            id: out?.id ?? null,
            email: out?.email ?? null,
            role: out?.role ?? null,
            permissions: (out?.permissions ?? []) as string[],
            isAuthenticated: true,
          },
        };
      }),
      clearUser: assign(() => ({
        user: {
          id: null,
          email: null,
          role: null,
          permissions: [] as string[],
          isAuthenticated: false,
        },
      })),
      setCases: assign((context, event) => {
        const doneEvent = event as { output?: Case[] } | undefined;
        const casesOutput = doneEvent?.output ?? [];
        return { cases: { ...context.cases, items: casesOutput, loading: false } };
      }),
      setCurrentCase: assign((context, event) => {
        const selectEvent = event as Extract<LegalAIEvent, { type: 'CASES.SELECT' }>;
        return {
          cases: { ...context.cases, currentCase: selectEvent?.case ?? context.cases.currentCase },
        };
      }),
      setAIResponse: assign((context, event) => {
        const doneEvent = event as { output?: AIResponse } | undefined;
        const aiResponse = doneEvent?.output ?? null;
        return { ai: { ...context.ai, lastResponse: aiResponse, isProcessing: false } };
      }),
      setAIError: assign((context, event) => {
        const errorEvent = event as { error?: Error } | undefined;
        const message = errorEvent?.error?.message ?? 'AI processing failed';
        return { ai: { ...context.ai, error: message, isProcessing: false } };
      }),
      startAIProcessing: assign((context, event) => {
        const queryEvent = event as Extract<LegalAIEvent, { type: 'AI.QUERY' }>;
        return {
          ai: {
            ...context.ai,
            isProcessing: true,
            currentQuery: queryEvent?.prompt ?? '',
            error: null,
          },
        };
      }),
    },

    services: {
      checkSystemStatus: fromPromise(async () => {
         // Mock implementation for now to avoid dependency import circles
         return {
            connected: true,
            services: {
              database: true, redis: true, ollama: true, gpu: true,
              pgvector: true, qdrant: true, neo4j: true
            },
            metrics: { errorCount: 0, performanceScore: 100, uptime: Date.now() }
         };
      }),

      authenticateUser: fromPromise(async ({ input }: { input: { credentials: { email: string; password: string } } }): Promise<AuthResponse> => {
           // Simplified mock
           await new Promise(resolve => setTimeout(resolve, 500));
           return {
             id: 'user_123',
             email: input.credentials.email,
             role: 'admin',
             permissions: ['all']
           };
      }),

      loadCases: fromPromise(
        async ({
          input,
        }: {
          input: { filters?: Partial<LegalAIContext['cases']['filters']> };
        }): Promise<Case[]> => {
          // Simplified mock
          await new Promise(resolve => setTimeout(resolve, 500));
          return [];
        }
      ),

      processAIQuery: fromPromise(
        async ({ input }: { input: { prompt: string } }): Promise<AIResponse> => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return {
                response: 'Mock AI Response',
                confidence: 0.95,
                sources: [],
                timestamp: new Date().toISOString(),
                model: 'mock-model',
                metadata: {}
            };
        }
      ),
    },
  }
);

export default legalAIMachine;
