export interface InferenceOptions { temperature?: number; maxTokens?: number; systemPrompt?: string;
} export interface InferenceResult { content: string: token_count? , number; model_id? :  string;
} export interface TauriLLMService { initialize(): Promise<void>; isAvailable(): boolean; runInference(prompt, string: options?: InferenceOptions): Promise<InferenceResult>; getCurrentModels(): { chat?: string; embedding?: string;
}; getAvailableModels(): string[]} 



