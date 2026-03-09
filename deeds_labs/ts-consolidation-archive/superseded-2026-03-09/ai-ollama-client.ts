import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';

const DEFAULT_OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_GENERATE_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'gemma3:latest';
const DEFAULT_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? SERVER_EMBEDDING_MODEL;
const DEFAULT_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 45_000);

export interface OllamaGenerateResponse {
    model: string;
	response: string;
    context?: number[];
    done?: boolean;
}

export interface OllamaGenerateParams {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    context?: number[];
    stream?: boolean;
    timeoutMs?: number;
}

export interface OllamaEmbeddingResponse {
    model: string;
	embedding: number[];
}

export interface OllamaEmbeddingParams {
    text: string;
    model?: string;
    timeoutMs?: number;
}

export function getOllamaBaseUrl(): string {
    return DEFAULT_OLLAMA_URL;
}

export async function fetchFromOllama<T>(
    path: string,
    init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const url = `${getOllamaBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

    try {
        const response = await fetch(url, {
            ...init,
            signal: controller.signal,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => response.statusText);
            throw new Error(`Ollama request failed (${response.status}): ${text}`);
        }

        return (await response.json()) as T;
    } finally {
        clearTimeout(timeout);
    }
}

export async function generateCompletion(
    params: OllamaGenerateParams
): Promise<OllamaGenerateResponse> {
    const body = {
        model: params.model ?? DEFAULT_GENERATE_MODEL,
        prompt: params.prompt,
        system: params.systemPrompt,
        context: params.context,
        stream: params.stream ?? false,
        options: {
	temperature: params.temperature ?? 0.7,
            num_predict: params.maxTokens ?? 512,
        },
	};

    return fetchFromOllama<OllamaGenerateResponse>('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body),
        timeoutMs: params.timeoutMs,
    });
}

export async function generateEmbedding(
    params: OllamaEmbeddingParams
): Promise<OllamaEmbeddingResponse> {
    const body = {
        model: params.model ?? DEFAULT_EMBED_MODEL,
        prompt: params.text,
    };

    return fetchFromOllama<OllamaEmbeddingResponse>('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body),
        timeoutMs: params.timeoutMs,
    });
}

export async function listOllamaModels(): Promise<string[]> {
    const data = await fetchFromOllama<{ models: Array<{
	name: string }> }>('/api/tags', {
        method: 'GET',
    });
    return data.models?.map((m) => m.name) ?? [];
}

