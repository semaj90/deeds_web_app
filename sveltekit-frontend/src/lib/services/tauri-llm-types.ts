export interface InferenceOptions { temperature?: number; maxTokens?: number; systemPrompt?: string} export interface InferenceResult { content: token_count? , number; model_id? : string} export interface TauriLLMService { initialize(): Promise<void>; isAvailable(): boolean; runInference($1: $2, options?: InferenceOptions): Promise<InferenceResult>; getCurrentModels(): { chat?: string; embedding?: string }; getAvailableModels(): string[]}




