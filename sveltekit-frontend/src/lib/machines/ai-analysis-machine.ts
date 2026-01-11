import { assign, fromPromise, setup } from 'xstate';

// Define specific types for precedents and references
export interface LegalPrecedent extends Record<string, unknown> {
    title?: string;
    citation?: string;
    relevance?: number;
}

export interface LegalReference extends Record<string, unknown> {
    source?: string;
    page?: number;
    text?: string;
}

export interface AIAnalysisContext {
    prompt: string;
    context: {
        caseId?: string;
        documentIds: string[];
        analysisType: 'summary' | 'recommendation' | 'risk-assessment' | 'precedent-analysis';
    };
    options: {
        includeReferences: boolean;
        maxTokens: number;
        temperature: number;
        model?: string;
    };
    analysisResults: {
        streamingText: string;
        summary?: string;
        recommendations?: string[];
        riskScore?: number;
        precedents?: LegalPrecedent[];
        references?: LegalReference[];
        confidence: number;
    };
    processingTime: number;
    tokensUsed: number;
    confidence: number;
    isStreaming: boolean;
    validationErrors: Record<string, string[]>;
    error: string | null;
}

export type AIAnalysisEvent =
    | { type: 'UPDATE_PROMPT'; prompt: string }
    | { type: 'UPDATE_OPTIONS'; options: Partial<AIAnalysisContext['options']> }
    | { type: 'START_ANALYSIS' }
    | { type: 'STREAM_CHUNK'; chunk: string }
    | { type: 'RESET' }
    | { type: 'RETRY' };

export const aiAnalysisMachine = setup({
    types: {
        context: {} as AIAnalysisContext,
        events: {} as AIAnalysisEvent
    },
    actors: {
        validateAnalysisRequest: fromPromise(async ({ input }: { input: AIAnalysisContext }) => {
            const errors: Record<string, string[]> = {};
            if (!input.prompt?.trim()) {
                errors.prompt = ['Analysis prompt is required'];
            } else if (input.prompt.length < 10) {
                errors.prompt = ['Prompt must be at least 10 characters'];
            }

            if (Object.keys(errors).length > 0) {
                throw { validationErrors: errors };
            }
            return true;
        }),
        performAIAnalysis: fromPromise(async ({ input, emit }: { input: AIAnalysisContext; emit: (event: any) => void }) => {
            const startTime = Date.now();
            const response = await fetch('/api/ai/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: input.prompt,
                    context: input.context,
                    options: input.options
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analysis failed');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.type === 'chunk') {
                                    fullText += data.chunk;
                                    emit({ type: 'STREAM_CHUNK', chunk: data.chunk });
                                } else if (data.type === 'final') {
                                    return {
                                        analysisResults: {
                                            ...data.results,
                                            streamingText: fullText
                                        },
                                        processingTime: Date.now() - startTime,
                                        tokensUsed: data.tokensUsed,
                                        confidence: data.confidence
                                    };
                                }
                            } catch (e) {
                                console.warn('Failed to parse SSE line', line);
                            }
                        }
                    }
                }
            }

            return {
                analysisResults: { streamingText: fullText, confidence: 1.0 },
                processingTime: Date.now() - startTime,
                tokensUsed: 0,
                confidence: 1.0
            };
        })
    }
}).createMachine({
    id: 'aiAnalysis',
    initial: 'idle',
    context: {
        prompt: '',
        context: {
            documentIds: [],
            analysisType: 'summary'
        },
        options: {
            includeReferences: true,
            maxTokens: 1000,
            temperature: 0.7
        },
        analysisResults: {
            streamingText: '',
            confidence: 0
        },
        processingTime: 0,
        tokensUsed: 0,
        confidence: 0,
        isStreaming: false,
        validationErrors: {},
        error: null
    },
    states: {
        idle: {
            on: {
                UPDATE_PROMPT: {
                    actions: assign({
                        prompt: ({ event }) => event.prompt
                    })
                },
                UPDATE_OPTIONS: {
                    actions: assign({
                        options: ({ context, event }) => ({
                            ...context.options,
                            ...event.options
                        })
                    })
                },
                START_ANALYSIS: 'validating'
            }
        },
        validating: {
            invoke: {
                src: 'validateAnalysisRequest',
                input: ({ context }) => context,
                onDone: {
                    target: 'analyzing',
                    actions: assign({
                        validationErrors: {},
                        error: null
                    })
                },
                onError: {
                    target: 'idle',
                    actions: assign({
                        validationErrors: ({ event }) => (event.error as any).validationErrors || {},
                        error: 'Validation failed'
                    })
                }
            }
        },
        analyzing: {
            entry: assign({
                isStreaming: true,
                analysisResults: ({ context }) => ({
                    ...context.analysisResults,
                    streamingText: ''
                }),
                error: null
            }),
            invoke: {
                src: 'performAIAnalysis',
                input: ({ context }) => context,
                onDone: {
                    target: 'completed',
                    actions: assign({
                        isStreaming: false,
                        analysisResults: ({ event }) => event.output.analysisResults,
                        processingTime: ({ event }) => event.output.processingTime,
                        tokensUsed: ({ event }) => event.output.tokensUsed,
                        confidence: ({ event }) => event.output.confidence
                    })
                },
                onError: {
                    target: 'error',
                    actions: assign({
                        isStreaming: false,
                        error: ({ event }) => (event.error as Error).message
                    })
                }
            },
            on: {
                STREAM_CHUNK: {
                    actions: assign({
                        analysisResults: ({ context, event }) => ({
                            ...context.analysisResults,
                            streamingText: context.analysisResults.streamingText + event.chunk
                        })
                    })
                }
            }
        },
        completed: {
            on: {
                START_ANALYSIS: 'validating',
                RESET: 'idle'
            }
        },
        error: {
            on: {
                RETRY: 'validating',
                RESET: 'idle'
            }
        }
    }
});




