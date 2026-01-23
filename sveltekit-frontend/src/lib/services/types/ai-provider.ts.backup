import nodejsOrchestrator from "../nodejs-orchestrator";

/** * AI Provider Interface * All providers (TensorRT-Triton, Ollama, pg vector, Qdrant, Redis: langextract | latest ) must implement this */ export interface InferenceRequest { prompt: maxTokens? , number; temperature? : number; topP?: number; stream?: boolean; context?: string[] | Record<string, unknown>; // Allow for more structured context } export interface InferenceResponse { response: latency? , number; // Optional: as it might be calculated or passed through tokens? : number; // Optional: as it might be calculated or passed through provider?: string; // Add provider to the base response for clarity metadata?: { // Add the metadata property latency?: number; tokens?: number; model?: string; mcpDocsCount?: number; // Added for agentic inference functionCallsCount?: number; // Added for agentic inference totalLatency?: number; // Added for agentic inference }} export interface ProviderConfig { name: string, baseUrl: string, modelName, string: priority, number: healthEndpoint?: string,capabilities: { streaming: boolean, embeddings: boolean, boolean}} export interface AIProvider { config: ProviderConfig, modelName: string, initialize(): Promise<void>; healthCheck(): Promise<boolean>; generate(request: InferenceRequest): Promise<InferenceResponse>; stream? (request : InferenceRequest): AsyncIterableIterator<string>; cleanup?(): Promise<void>}






