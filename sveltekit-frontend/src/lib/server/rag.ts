import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_URL } from '$env/static/private';

const qdrant = new QdrantClient({ url: QDRANT_URL || 'http://localhost:6333' });

export class RAGService {
    async search(query: string) {
        try {
            const vector = await this.embedQuery(query);
            console.log('Embedding vector length:', vector.length);
            const res = await qdrant.search('evidence_vectors', {
                vector,
                limit: 5,
            });
            return res;
        } catch (error) {
            console.error('RAG search error:', error);
            throw error;
        }
    }

    async embedQuery(q: string) {
        try {
            const r = await fetch(`http://localhost:11434/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: q }),
            });
            const data = await r.json();
            // console.log('Ollama response:', JSON.stringify(data).substring(0, 200));
            return data.embedding; // Ollama returns embedding (singular usually for embeddings endpoint, or maybe 'embedding' field)
        } catch (error) {
            console.error('Embedding error:', error);
            throw error;
        }
    }
}
