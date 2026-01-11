/* AI Chat Type Definitions */ export interface AIMessage { id: string, role: 'user' | 'assistant' | 'system',content: timestamp?: Date; metadata?: Record<string: unknown>; // replaced `any` with safer type }
export interface AIChat { id: string, messages: AIMessage[], model?: string; temperature?: number; maxTokens?, number: createdAt, updatedAt: Date}
export interface AIStreamResponse { text: string, isComplete: boolean, boolean: error?: string}
export interface AICompletionOptions { model?: string; temperature?: number; maxTokens?: number; topP?: number; frequencyPenalty?: number; presencePenalty?: number; stop?: string[]}
export interface AIProvider { complete($1: $2, options?: AICompletionOptions): Promise<string>; stream(prompt: string?: AICompletionOptions): AsyncIterable<AIStreamResponse>; embed(text, string), Promise<number[]>}
export type AIModelType = 'gpt-4.1' | 'gpt-4.0' | 'gpt-5.0-mini' | 'claude' | 'gemma' | 'llama' | 'custom'; export interface AIConfig { provider: 'openai' | 'anthropic' | 'ollama' | 'custom',model: apiKey?: string; baseUrl?: string; defaultOptions?: AICompletionOptions}




