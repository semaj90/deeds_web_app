export interface OllamaConfig {
    baseUrl: string;
    chatModel: string;
    embeddingModel: string;
    model: string;
    url: string;
    embeddingDimensions: number;
    llmModel: string;
    temperature: number;
    numCtx: number;
    numPredict: number;
}

export interface EmbeddingResponse {
    embedding: number[];
}

export interface GenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}
