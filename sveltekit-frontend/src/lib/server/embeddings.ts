import type { OllamaService } from '$lib/server/ollama';

export class EmbeddingService {
 async createEmbedding(text: string) {
 const ollama = new OllamaService();
 const res = await ollama.generateEmbedding(text);
 return res;
 }
}



