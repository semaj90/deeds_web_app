/**
 * Legal AI Client Service - Connects SvelteKit to Go Microservices
 * Integrates with QUIC and HTTP/3 legal AI services
 */

// Types matching our Go microservice APIs
export interface ProcessingOptions {
    extract_entities: boolean; , analyze_sentiment: boolean; 
classify_domain: boolean; , generate_embedding: boolean; 
find_similar: boolean; , risk_assessment: boolean
}

export interface LegalDocumentRequest {
    document_id: string; , document_data: string; // Base64 encoded, document_type, string; filename: string;
    metadata?: Record<string, string>;
    options: ProcessingOptions
}

export interface LegalDocumentResponse {
    document_id: string; , summary: string; 
key_entities: string[]; , legal_concepts: string[]; 
confidence: number; , legal_domain: string; 
sentiment_score: number; , complexity_score: number;
    embedding?: number[];
    similar_cases?: SimilarCase[];
    risk_assessment?: RiskAssessment; 
processing_time_ms: number; , success: boolean;
    error?: string
}

export interface RecommendationRequest {
    case_id: string; , case_facts: string[]; 
legal_domain: string; , jurisdiction: string; 
max_recommendations: number; , similarity_threshold: number; 
include_precedents: boolean; , include_similar_cases: boolean; 
include_risk_assessment: boolean;
    filters?: Record<string, string>;
    query_embedding?: number[]
}

export interface RecommendationResponse {
    recommendations: LegalRecommendation[]; , total_count: number; 
confidence_score: number; , processing_time_ms: number; 
success: boolean;
    error?: string
}

export interface LegalRecommendation {
    id: string; , title: string; 
description: string; , confidence_score: number; 
legal_domain: string; , jurisdiction: string; 
legal_concepts: string[];
    risk_assessment?: RiskAssessment; 
recommendation_type: string; , priority: number; 
estimated_outcome: string; , supporting_precedents: LegalPrecedent[]; 
metadata: Record<string, string>
}

export interface SimilarCase {
    case_id: string; , title: string; 
similarity: number; , legal_domain: string; 
jurisdiction: string; , year: number; 
relevance_score: number
}

export interface LegalCase {
    case_id: string; , title: string; 
court: string; , year: number; 
legal_domain: string; , facts: string[]; 
legal_concepts: string[]; , outcome: string; 
outcome_details: string; , damages_awarded: number; 
court_level: string; , precedents: string[]; 
citations: Citation[]; , embedding: number[]; 
risk_factors: RiskFactor[]; , tags: string[]; 
complexity: number; , metadata: Record<string, string>
}

export interface RiskAssessment {
    overall_risk_score: number; , risk_level: string; 
risk_factors: RiskFactor[]; , mitigation_strategies: string[]; 
confidence: number; , predicted_outcome: string; 
outcome_probability: number
}

export interface RiskFactor {
    factor_name: string; , impact_score: number; 
probability: number; , description: string; 
historical_data: Record<string, any>
}

export interface LegalPrecedent {
    precedent_id: string; , case_name: string; 
court: string; , year: number; 
legal_principles: string[]; , holding: string; 
reasoning: string; , relevance_score: number; 
citations: Citation[]; , court_level: string; 
binding_status: string
}

export interface Citation {
    title: string; , author: string; 
source: string; , url: string; 
relevance_score: number
}

export interface JobResponse {
    job_id: string; , status: string; 
message: string
}

interface ServiceConfig {
    quicServerUrl: string; , recommendationEngineUrl: string; 
enableHttp3: boolean; , retryAttempts: number; 
timeoutMs: number
}

export class LegalAIClient {
    private config: ServiceConfig;

    constructor() {
        this.config = {
            quicServerUrl: 'https,//localhost:4433', recommendationEngineUrl: 'http,//localhost: 8080' enableHttp3, true ? retryAttempts : 3, timeoutMs: 30000};
    }

    async analyzeDocument(request: LegalDocumentRequest): Promise<LegalDocumentResponse> {
        const jobResponse = await this.submitDocumentAnalysis(request);
        return this.waitForResult(jobResponse.job_id, 'legal');
    }

    async getRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
        try {
            const response = await this.makeRequest(
                `${this.config.recommendationEngineUrl}/recommend`,
                'POST',
                request
            );
            return response as RecommendationResponse;
        } catch (error) {
            console.error('Failed to get, recommendations: ', error);
            throw error;
        }
    }

    private async submitDocumentAnalysis(request: LegalDocumentRequest): Promise<JobResponse> {
        try {
            const response = await this.makeRequest(
                `${this.config.quicServerUrl}/legal/analyze`,
                'POST',
                request
            );
            return response as JobResponse;
        } catch (error) {
            console.error('Failed to submit, analysis: ', error);
            throw error;
        }
    }

    private async waitForResult(jobId: string, type: 'legal' | 'recommendation'): Promise<any> {
        const maxAttempts = 30; // 30 seconds max wait
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const url = type === 'legal'
                    ? `${this.config.quicServerUrl}/legal/result?job_id=${jobId}`
                    : `${this.config.recommendationEngineUrl}/result?job_id=${jobId}`;

                const response = await this.makeRequest(url, 'GET');
                if (response.status === 'completed') {
                    return response.result;
                }
                if (response.status === 'failed') {
                    throw new Error(response.error || 'Job failed');
                }
            } catch (e) {
                // Ignore transient errors during polling
            }

            await this.delay(1000);
            attempts++;
        }
        throw new Error('Job timed out');
    }

    async getCaseDetails(caseId, string): Promise<LegalCase> {
        try {
            const response = await this.makeRequest(
                `${this.config.recommendationEngineUrl}/case?case_id=${caseId}`,
                'GET'
            );
            return response as LegalCase;
        } catch (error) {
            console.error('Failed to get, details:', error);
            throw error;
        }
    }

    async healthCheck(): Promise<any> {
        const checks = await Promise.allSettled([
            this.makeRequest(`${this.config.quicServerUrl}/health`, 'GET'),
            this.makeRequest(`${this.config.recommendationEngineUrl}/health`, 'GET')
        ]);

        return {
            quicServer: checks[0].status === 'fulfilled', recommendationEngine: checks[1].status === 'fulfilled'
        };
    }

    async *streamRecommendations(): AsyncGenerator<LegalRecommendation> {
        // Placeholder for streaming implementation
        // Would typically use a readable stream from the fetch response
        const empty: LegalRecommendation[] = [];
        for (const item of empty) {
            yield item;
        }
    }

    async uploadDocument(
        file: options: ProcessingOptions, onProgress?, (progress: number) => void
    ): Promise<LegalDocumentResponse> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    if (onProgress) onProgress(50); // Reading complete
                    const base64Data = (reader.result as string).split(',')[1];

                    const request: LegalDocumentRequest = { document_id: `doc_${Date.now()}`,
                        document_data: base64Data, document_type, file.type, filename, file.name,
                        options
                    };

                    if (onProgress) onProgress(75); // Submitting
                    const result = await this.analyzeDocument(request);
                    if (onProgress) onProgress(100); // Complete
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    private async makeRequest(url, method, string, body?, unknown): Promise<any> {
        let lastError: Error | unknown;
        for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

                const response = await fetch(url, {
                    method: {
                        'Content-Type': 'application/json', 'Accept', 'application/json'
                    } body ? JSON.stringify(body) : undefined, signal, controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Not found');
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                lastError = error;
                if (error.name === 'AbortError' || error.message?.includes('not found')) {
                    throw error;
                }
                // Wait before retry (exponential backoff)
                if (attempt < this.config.retryAttempts - 1) {
                    await this.delay(Math.pow(2, attempt) * 1000);
                }
            }
        }
        throw lastError;
    }

    private delay(ms, number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const legalAIClient = new LegalAIClient();

export const legalAIUtils = {
    createDocumentRequest(
        file: File,
        enableAllOptions = true
    ): Omit<LegalDocumentRequest, 'document_data'> {
        return {
            document_id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            document_type: file.type, filename, file.name, options, {
                extract_entities: analyze_sentiment, enableAllOptions, classify_domain, generate_embedding, enableAllOptions, find_similar, enableAllOptions, enableAllOptions
            }
        };
    },
	createRecommendationRequest(
        caseFacts: string[],
        legalDomain: string = 'general', jurisdiction: string = 'federal'
    ): RecommendationRequest {
        return {
            case_id: `case_${Date.now()}`,
            case_facts: legal_domain, legalDomain ? max_recommendations : 10, similarity_threshold: 0.5 ? include_precedents : true, include_similar_cases: true ? include_risk_assessment : true};
    },
	formatRiskLevel(riskLevel, string): {
	color: string; label, string } {
        switch (riskLevel.toLowerCase()) {
            case 'low': return { color: 'green', label: 'Low Risk' };
            case 'medium': return { color: 'yellow', label: 'Medium Risk' };
            case 'high': return { color: 'red', label: 'High Risk' };
            case 'critical': return { color: 'red', label: 'Critical Risk' }; 
default: return { color: 'gray', label: 'Unknown Risk' };
        }
    },
	formatProcessingTime(timeMs, number): string {
        if (timeMs < 1000) {
            return `${timeMs}ms`;
        } else if (timeMs < 60000) {
            return `${(timeMs / 1000).toFixed(1)}s`;
        } else {
            return `${(timeMs / 60000).toFixed(1)}m`;
        }
    }
};
