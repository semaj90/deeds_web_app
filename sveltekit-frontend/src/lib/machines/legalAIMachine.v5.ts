import { productionServiceClient } from '$lib/api/production-service-client';
import { assign, fromPromise, setup } from 'xstate';

// Interfaces for Case, Evidence, AI Response
export interface Case {
    id: string;
    title: string;
    status: string;
    priority: string;
    category: string;
    createdAt?: string;
    description?: string;
}

export interface AIResponse {
    response: string;
    confidence: number;
    sources: any[];
    timestamp: string;
    model: string;
}

export interface LegalAIContext {
    user: {
        id: string | null;
        email: string | null;
        role: string | null;
        isAuthenticated: boolean;
    };
    cases: {
        items: Case[];
        currentCase: Case | null;
        loading: boolean;
        error: string | null;
    };
    ai: {
        isProcessing: boolean;
        lastResponse: AIResponse | null;
        error: string | null;
    };
    system: {
        connected: boolean;
        services: Record<string, boolean>;
    };
}

export type LegalAIEvent =
    | { type: 'AUTH.LOGIN'; credentials: { email: string; password: string } }
    | { type: 'AUTH.LOGOUT' }
    | { type: 'CASES.LOAD' }
    | { type: 'CASES.SELECT'; case: Case }
    | { type: 'AI.QUERY'; prompt: string };

export const legalAIMachine = setup({
    types: {
        context: {} as LegalAIContext,
        events: {} as LegalAIEvent
    },
    actors: {
        checkSystemStatus: fromPromise(async () => {
            try {
                const response = await productionServiceClient.makeRequest('/api/system/health', { method: 'GET' });
                return response.data;
            } catch (e) {
                return { connected: false, services: {} };
            }
        }),
        authenticateUser: fromPromise(async ({ input }: { input: any }) => {
            const response = await productionServiceClient.makeRequest('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(input.credentials)
            });
            return response.data;
        }),
        loadCases: fromPromise(async () => {
            const response = await productionServiceClient.makeRequest('/api/cases', { method: 'GET' });
            return response.data.items as Case[];
        }),
        processAIQuery: fromPromise(async ({ input }: { input: { prompt: string } }) => {
            const response = await productionServiceClient.makeRequest('/api/ai/query', {
                method: 'POST',
                body: JSON.stringify({ prompt: input.prompt })
            });
            return response.data as AIResponse;
        })
    }
}).createMachine({
    id: 'legalAI',
    initial: 'initializing',
    context: {
        user: { id: null, email: null, role: null, isAuthenticated: false },
        cases: { items: [], currentCase: null, loading: false, error: null },
        ai: { isProcessing: false, lastResponse: null, error: null },
        system: { connected: false, services: {} }
    },
    states: {
        initializing: {
            invoke: {
                src: 'checkSystemStatus',
                onDone: {
                    target: 'idle',
                    actions: assign({
                        system: ({ event }) => event.output
                    })
                },
                onError: {
                    target: 'idle'
                }
            }
        },
        idle: {
            on: {
                'AUTH.LOGIN': 'authenticating',
                'CASES.LOAD': 'loadingCases',
                'AI.QUERY': 'processingAI'
            }
        },
        authenticating: {
            invoke: {
                src: 'authenticateUser',
                input: ({ event }) => event as any,
                onDone: {
                    target: 'authenticated',
                    actions: assign({
                        user: ({ event }) => ({
                            id: event.output.id,
                            email: event.output.email,
                            role: event.output.role,
                            isAuthenticated: true
                        })
                    })
                },
                onError: {
                    target: 'idle'
                }
            }
        },
        authenticated: {
            initial: 'ready',
            states: {
                ready: {
                    on: {
                        'CASES.LOAD': '#legalAI.loadingCases',
                        'AI.QUERY': '#legalAI.processingAI',
                        'AUTH.LOGOUT': '#legalAI.idle'
                    }
                }
            }
        },
        loadingCases: {
            entry: assign({ cases: ({ context }) => ({ ...context.cases, loading: true }) }),
            invoke: {
                src: 'loadCases',
                onDone: {
                    target: 'authenticated',
                    actions: assign({
                        cases: ({ context, event }) => ({
                            ...context.cases,
                            items: event.output,
                            loading: false
                        })
                    })
                },
                onError: {
                    target: 'authenticated',
                    actions: assign({
                        cases: ({ context }) => ({ ...context.cases, loading: false, error: 'Failed to load cases' })
                    })
                }
            }
        },
        processingAI: {
            entry: assign({ ai: ({ context }) => ({ ...context.ai, isProcessing: true }) }),
            invoke: {
                src: 'processAIQuery',
                input: ({ event }) => event as any,
                onDone: {
                    target: 'authenticated',
                    actions: assign({
                        ai: ({ context, event }) => ({
                            ...context.ai,
                            lastResponse: event.output,
                            isProcessing: false
                        })
                    })
                },
                onError: {
                    target: 'authenticated',
                    actions: assign({
                        ai: ({ context }) => ({ ...context.ai, isProcessing: false, error: 'AI processing failed' })
                    })
                }
            }
        }
    }
});




