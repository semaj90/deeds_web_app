import { assign, createMachine, fromPromise } from 'xstate';

export interface ConversationEntry {
    id: string;
    type: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface DocumentType {
    id: string;
    title: string;
    filename: string;
    fileSize: number;
    extractedText: string;
    isIndexed: boolean;
}

export interface AIAssistantContext {
    currentQuery: string;
    response: string;
    conversationHistory: ConversationEntry[];
    sessionId: string;
    isProcessing: boolean;
    model: string;
    temperature: number;
    maxTokens: number;
    availableModels: string[];
    gpuReady: boolean;
    error: string | null;
}

export type AIAssistantEvent =
    | { type: 'SEND_MESSAGE'; message: string }
    | { type: 'CLEAR_CONVERSATION' }
    | { type: 'SET_MODEL'; model: string }
    | { type: 'STREAM_CHUNK'; chunk: string }
    | { type: 'CANCEL' }
    | { type: 'RESET' };

export const aiAssistantMachine = createMachine({
    types: {
        context: {} as AIAssistantContext,
        events: {} as AIAssistantEvent
    },
    id: 'aiAssistant',
    initial: 'initializing',
    context: {
        currentQuery: '',
        response: '',
        conversationHistory: [],
        sessionId: `session_${Date.now()}`,
        isProcessing: false,
        model: 'gemma3-legal:latest',
        temperature: 0.7,
        maxTokens: 2048,
        availableModels: ['gemma3-legal:latest', 'gpt-4-legal'],
        gpuReady: false,
        error: null
    },
    states: {
        initializing: {
            invoke: {
                src: fromPromise(async () => {
                    // Check for GPU availability or other services
                    const gpuReady = typeof navigator !== 'undefined' && 'gpu' in navigator;
                    return { gpuReady };
                }),
                onDone: {
                    target: 'idle',
                    actions: assign({
                        gpuReady: ({ event }) => event.output.gpuReady
                    })
                },
                onError: {
                    target: 'idle'
                }
            }
        },
        idle: {
            on: {
                SEND_MESSAGE: {
                    target: 'processing',
                    actions: assign({
                        currentQuery: ({ event }) => event.message,
                        conversationHistory: ({ context, event }) => [
                            ...context.conversationHistory,
                            {
                                id: `user_${Date.now()}`,
                                type: 'user',
                                content: event.message,
                                timestamp: new Date()
                            }
                        ]
                    })
                },
                CLEAR_CONVERSATION: {
                    actions: assign({ conversationHistory: [] })
                },
                SET_MODEL: {
                    actions: assign({ model: ({ event }) => event.model })
                }
            }
        },
        processing: {
            entry: assign({ isProcessing: true, response: '' }),
            invoke: {
                src: fromPromise(async ({ input }: { input: { prompt: string; model: string } }) => {
                    const response = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: input.prompt,
                            model: input.model
                        })
                    });

                    if (!response.ok) throw new Error(`AI query failed: ${response.statusText}`);

                    const data = await response.json();
                    return data.response as string;
                }),
                input: ({ context }) => ({
                    prompt: context.currentQuery,
                    model: context.model
                }),
                onDone: {
                    target: 'idle',
                    actions: assign({
                        isProcessing: false,
                        response: ({ event }) => event.output,
                        conversationHistory: ({ context, event }) => [
                            ...context.conversationHistory,
                            {
                                id: `assistant_${Date.now()}`,
                                type: 'assistant',
                                content: event.output,
                                timestamp: new Date()
                            } as ConversationEntry
                        ]
                    })
                },
                onError: {
                    target: 'error',
                    actions: assign({
                        isProcessing: false,
                        error: ({ event }) => (event.error as Error).message
                    })
                }
            },
            on: {
                CANCEL: {
                    target: 'idle',
                    actions: assign({
                        isProcessing: false,
                        error: 'Request cancelled by user'
                    })
                },
                STREAM_CHUNK: {
                    actions: assign({
                        response: ({ context, event }) => context.response + event.chunk
                    })
                }
            }
        },
        error: {
            on: {
                RESET: 'idle'
            }
        }
    }
});

export default aiAssistantMachine;




