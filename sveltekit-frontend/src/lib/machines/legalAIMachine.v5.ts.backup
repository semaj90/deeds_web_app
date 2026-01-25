import { assign, createMachine, fromPromise } from 'xstate';
import { productionServiceClient } from '../../api/production-service-client';

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
  metadata?: { [key: string]: unknown }; // Changed 'any' to 'unknown'
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
          input: ({ event }: { event: any }) => ({
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
          input: ({ event }: { event: any }) => ({
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
          input: ({ event }: { event: any }) => ({
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
        // Placeholder state for user registration
      },
      creatingCase: {
        // Placeholder state for case creation
      },
      checkingStatus: {
        // Placeholder state for status checking
      },
    },
  },
  {
    actions: {
      updateSystem: assign((_, event) => {
        // avoid `any` — narrow the event shape we expect
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

    // XState v5 expects service factories under `services` in the machine options
    services: {
      checkSystemStatus: fromPromise(async () => {
        try {
          const [clusterStatusResponse, serviceHealthResponse] = await Promise.all([
            productionServiceClient.makeRequest('/api/system/cluster-status', { method: 'GET' }),
            productionServiceClient.makeRequest('/api/system/service-health', { method: 'GET' }),
          ]);

          const clusterResp = clusterStatusResponse as ServiceResponse<LooseObject>;
          const serviceResp = serviceHealthResponse as ServiceResponse<LooseObject[]>;

          if (!clusterResp?.success || !serviceResp.success) {
            throw new Error('Failed to fetch system status');
          }

          const clusterStatus = clusterResp.data as LooseObject | undefined;
          const serviceHealth = (serviceResp.data as LooseObject[] | undefined) ?? [];

          const totalServices = (clusterStatus?.totalServices as number) ?? 0;
          const healthyServices = (clusterStatus?.healthyServices as number) ?? 0;
          const performanceScore =
            totalServices > 0 ? Math.round((healthyServices / totalServices) * 100) : 0;

          return {
            connected: healthyServices > 0,
            services: {
              database: serviceHealth.some(
                (s) => String(s.service).includes('postgres') && String(s.status) === 'healthy'
              ),
              redis: serviceHealth.some(
                (s) => String(s.service).includes('redis') && String(s.status) === 'healthy'
              ),
              ollama: serviceHealth.some(
                (s) => String(s.service).includes('ollama') && String(s.status) === 'healthy'
              ),
              gpu: serviceHealth.some(
                (s) => String(s.service).includes('gpu') && String(s.status) === 'healthy'
              ),
              pgvector: serviceHealth.some(
                (s) => String(s.service).includes('pgvector') && String(s.status) === 'healthy'
              ),
              qdrant: serviceHealth.some(
                (s) => String(s.service).includes('qdrant') && String(s.status) === 'healthy'
              ),
              neo4j: serviceHealth.some(
                (s) => String(s.service).includes('neo4j') && String(s.status) === 'healthy'
              ),
            },
            metrics: {
              errorCount: serviceHealth.reduce(
                (acc: number, s) => acc + ((s.errorCount as number) ?? 0),
                0
              ),
              performanceScore: performanceScore,
              uptime: Date.now(),
            },
          };
        } catch (error: unknown) {
          console.error('System status check failed: ', error);
          return {
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
            metrics: { errorCount: 1, performanceScore: 0, uptime: 0 },
          };
        }
      }),

      authenticateUser: fromPromise<AuthResponse>(
        (async (params: any) => {
          const { input } = params as { input: { credentials: { email: string; password: string } } };
          try {
            const response = (await productionServiceClient.makeRequest('/api/auth/login', {
              method: 'POST',
              body: input.credentials,
            })) as ServiceResponse<LooseObject>;

            if (response?.success && response.data) {
              const data = response.data as LooseObject;
              const userObj = (data.user as LooseObject | undefined) ?? {};
              return {
                id: ((data.id as string) || (userObj.id as string)) ?? '',
                email: (data.email as string) || input.credentials.email,
                role: (data.role as string) ?? 'legal_professional',
                permissions: ((data.permissions as string[]) ?? [
                  'read:cases',
                  'write:cases',
                  'ai:query',
                ]) as string[],
              };
            } else {
              throw new Error(response?.error ?? 'Authentication failed');
            }
          } catch (error: unknown) {
            console.error('Authentication error: ', error);
            throw new Error('Authentication service unavailable');
          }
        }) as any
      ),

      loadCases: fromPromise<Case[]>(
        (async (params: any) => {
          const { input } = params as { input: { filters?: Partial<LegalAIContext['cases']['filters']> } };
          try {
            const response = (await productionServiceClient.makeRequest('/api/cases', {
              method: 'GET',
              body: input?.filters ?? {},
            })) as ServiceResponse<LooseObject[] | { cases?: LooseObject[] }>;

            if (response?.success && response.data) {
              const data = response.data as LooseObject[] | { cases?: LooseObject[] };
              const casesArray = Array.isArray(data) ? (data as LooseObject[]) : (data.cases ?? []);
              return casesArray.map((caseData) => ({
                id: (caseData.id as string) ?? '',
                title: (caseData.title as string) ?? '',
                status: (caseData.status as string) ?? 'pending',
                priority: (caseData.priority as string) ?? 'medium',
                category: (caseData.category as string) ?? 'general',
                createdAt:
                  (caseData.createdAt as string) ?? (caseData.created_at as string | undefined),
                updatedAt:
                  (caseData.updatedAt as string) ?? (caseData.updated_at as string | undefined),
                description: caseData.description as string | undefined,
                assignedTo:
                  (caseData.assignedTo as string) ?? (caseData.assigned_to as string | undefined),
              }));
            } else {
              console.warn('Failed to load cases: ', response.error);
              return [];
            }
          } catch (error: unknown) {
            console.error('Error loading cases: ', error);
            return [];
          }
        }) as any
      ),

      processAIQuery: fromPromise<AIResponse>(
        (async (params: any) => {
          const { input } = params as { input: { prompt: string } };
          try {
            const response = (await productionServiceClient.makeRequest('/api/ai/query', {
              method: 'POST',
              body: input,
            })) as ServiceResponse<LooseObject>;

            if (response?.success && response.data) {
              const data = response.data as LooseObject;
              return {
                response: ((data.response as string) || (data.answer as string)) ?? '',
                confidence: (data.confidence as number) ?? 0.85,
                sources: ((data.sources as Source[]) ??
                  (data.references as Source[]) ??
                  []) as Source[],
                timestamp: new Date().toISOString(),
                model: (data.model as string) ?? 'unknown',
                metadata: (data.metadata as Record<string, unknown>) || {},
              };
            } else {
              throw new Error(response?.error ?? 'AI query failed');
            }
          } catch (error: unknown) {
            console.error('AI query error: ', error);
            throw new Error('AI service unavailable');
          }
        }) as any
      ),
    },
  }
);

// Create the actor
// export const legalAIActor = createActor(legalAIMachine);

// Create Svelte store for reactive state
// export const legalAIState = writable(legalAIActor.getSnapshot());

// Update store when state changes
// legalAIActor.subscribe((snapshot) => {
// legalAIState.set(snapshot);
// });

// Start the actor - moved to integration service to prevent conflicts
// legalAIActor.start();

export default legalAIMachine;
