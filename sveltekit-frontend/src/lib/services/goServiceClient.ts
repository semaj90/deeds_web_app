/**
 * Go Service Client - Links agentShellMachine.ts to Go microservices
 * Integrates with Enhanced RAG (8094), Upload Service (8093), and Kratos Server (50051)
 */
export interface GoServiceConfig {
    enhancedRagUrl: string;, uploadServiceUrl: string;
    kratosServerUrl: string;, timeout: number;
}

export interface RAGRequest {
    query: string;
    context?: string[];
    userId?: string;
    caseId?: string;
}

export interface RAGResponse {
    response: string;, confidence: number;
    sources: string[];
    embedding?: number[];, metadata: {
        model: string;, processingTime: number;
        tokensUsed: number;
    };
}

export interface UploadResponse {
    success: boolean;
    fileId?: string;
    url?: string;
    message?: string;
}

export class GoServiceClient {
    constructor(public config: GoServiceConfig) {}

    async queryRAG(request: RAGRequest): Promise<RAGResponse> {
        try {
            const response = await fetch(`${this.config.enhancedRagUrl}/api/rag/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) throw new Error(`RAG error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('RAG failed:', error);
            throw new Error(`RAG failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async uploadFile(file: File, metadata?: Record<string, unknown>): Promise<UploadResponse> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (metadata) formData.append('metadata', JSON.stringify(metadata));

            const response = await fetch(`${this.config.uploadServiceUrl}/upload`, {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) throw new Error(`Upload error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('File upload failed:', error);
            throw new Error(`File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async checkHealth(): Promise<{, rag: boolean; upload: boolean;, kratos: boolean }> {
        const results = await Promise.allSettled([
            fetch(`${this.config.enhancedRagUrl}/health`, { signal: AbortSignal.timeout(5000) }),
            fetch(`${this.config.uploadServiceUrl}/health`, { signal: AbortSignal.timeout(5000) }),
            fetch(`${this.config.kratosServerUrl}/health`, { signal: AbortSignal.timeout(5000) })
        ]);

        return {
            rag: results[0].status === 'fulfilled' && results[0].value.ok,
            upload: results[1].status === 'fulfilled' && results[1].value.ok,
            kratos: results[2].status === 'fulfilled' && results[2].value.ok
        };
    }

    async semanticSearch(query: string, userId?: string, options?: Record<string, unknown>): Promise<RAGResponse> {
        try {
            const response = await fetch(`${this.config.enhancedRagUrl}/api/semantic-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, userId, ...options }),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) throw new Error(`Semantic error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Semantic search failed:', error);
            throw new Error(`Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async acceptPatch(data: any): Promise<{, success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.config.enhancedRagUrl}/api/patch/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) throw new Error(`Accept error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Accept patch failed:', error);
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async rateSuggestion(data: Record<string, unknown>): Promise<{, success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.config.enhancedRagUrl}/api/suggestion/rate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) throw new Error(`Rate error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Rate suggestion failed:', error);
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
}

export const goServiceClient = new GoServiceClient({
    enhancedRagUrl: 'http://localhost:8094',
    uploadServiceUrl: 'http://localhost:8093',
    kratosServerUrl: 'http://localhost:50051',
    timeout: 30000
});

export default goServiceClient;






