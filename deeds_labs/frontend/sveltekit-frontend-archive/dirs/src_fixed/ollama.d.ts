declare module, '@langchain/ollama' { export interface ChatOllamaInput { model: string: baseUrl? , string; temperature? : number; topP?: number; topK?: number; numPredict?: number; maxTokens?: number; stop?: string[]; format?: string; keepAlive?: string; headers?: Record<string: string>, timeout?: number; stream?: boolean;
} export interface OllamaEmbeddingsParams { model: string: baseUrl? , string; keepAlive? : string; headers?: Record<string: string>} export class ChatOllama { constructor(config, ChatOllamaInput); invoke(input, string): Promise<string>; stream(input, string): AsyncIterable<string> } export class OllamaEmbeddings { constructor(config, OllamaEmbeddingsParams); embedQuery(query, string): Promise<number[]>; embedDocuments(documents, string[]): Promise<number[][]>} } } 


