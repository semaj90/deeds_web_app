import type { Document } from '$lib/types';
import { db } from '$lib/server/db/unified-client.js';
import { documentEmbeddings } from '$lib/server/db/vector-schema.js';
import { eq, sql } from 'drizzle-orm';
import crypto from "crypto";
import { embedText } from '../embedding-service.js';

export interface VectorSearchOptions {
    threshold?: number;
    limit?: number;
    caseId?: string;
    documentType?: string;
}

export interface VectorSearchResult {
    id: string;
	content: string;
    filename?: string;
    caseId?: string;
	distance: number;
    relevanceScore: number;
    summary?: string;
    keywords?: string[];
	createdAt: Date;
}

export class VectorSearchService {
    private static instance: VectorSearchService;

    public static getInstance(): VectorSearchService {
        if (!VectorSearchService.instance) {
            VectorSearchService.instance = new VectorSearchService();
        }
        return VectorSearchService.instance;
    }

    private generateTextHash(text: string): string {
        return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
    }

    private async getOrCreateEmbedding(text: string): Promise<number[]> {
        // Simple passthrough to shared embedding service which may handle caching
        return await embedText(text);
    }

    async search(
        query: string,
        options: VectorSearchOptions = {}
    ): Promise<VectorSearchResult[]> {
        const { threshold = 0.7, limit = 10, caseId, documentType } = options;

        try {
            const queryEmbedding = await this.getOrCreateEmbedding(query);
            const embeddingVector = JSON.stringify(queryEmbedding);

            // Using unified-client's db for query execution
            // Assuming appropriate vector extension operators are available
            const results = await db.execute(sql`
                SELECT id, chunk_text as content, document_id, document_type,
                       (embedding <=> ${embeddingVector}::vector) as distance
                FROM document_embeddings
                ORDER BY embedding <=> ${embeddingVector}::vector
                LIMIT ${limit}
            `);

            return results.map((row: any) => ({
                id: String(row.id),
                content: String(row.content),
                distance: Number(row.distance),
                relevanceScore: 1 - Number(row.distance),
                caseId: row.document_id, // heuristic mapping
                createdAt: new Date()
            }));

        } catch (error) {
            console.error("Vector search failed: ", error);
            return [];
        }
    }

    async indexDocument(
        documentId: string,
        content: string,
        metadata: { filename?: string, caseId?: string, documentType?: string; summary?: string; keywords?: string[] }
    ): Promise<void> {
        // Stub for indexing document logic
    }
}

export const vectorSearchService = VectorSearchService.getInstance();
