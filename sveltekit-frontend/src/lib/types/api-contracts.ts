// End-to-End Type-Safe API Contracts
// Shared types between client and server for complete type safety
import type { z } from 'zod';

// Use local shared types (api-schemas) which export Case, Evidence, User interfaces
import type { Case, Evidence, User } from './api-schemas.js';
import type { StandardApiResponse } from '../server/api/response.js';

// Re-export StandardApiResponse for external use
export type { StandardApiResponse };

// ==================== API CONTRACT TYPES ====================

// Base API response wrapper
export interface ApiContract<TRequest = unknown, TResponse = unknown> {
    request: TRequest; response: StandardApiResponse<TResponse>;
}

// ==================== CASE API CONTRACTS ====================

export interface CaseListRequest {
    query?: string;
    status?: string[];
    priority?: string[];
    assignedTo?: string;
    dateStart?: string; // ISO date
    dateEnd?: string; // ISO date
    page?: number;
    limit?: number;
    useVectorSearch?: boolean;
}

export interface CaseListResponse {
    cases: Case[]; pagination: {
        page: number; limit: number;
        total: number; hasNext: boolean;
        hasPrev: boolean;
    };
    search?: { term: string;
        resultsCount: number; vectorSearchUsed: boolean;
    } | null;
}

export type CaseList = ApiContract<CaseListRequest, CaseListResponse>;

export interface CaseCreateRequest {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'investigating' | 'pending' | 'closed' | 'archived';
    incidentDate?: string; // ISO date
    location?: string;
    jurisdiction?: string;
}

export interface CaseCreateResponse {
    case: Case; message: string;
}

export type CaseCreate = ApiContract<CaseCreateRequest, CaseCreateResponse>;

export interface CaseUpdateRequest {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    location?: string;
    jurisdiction?: string;
}

export interface CaseUpdateResponse {
    case: Case; message: string;
}

export type CaseUpdate = ApiContract<CaseUpdateRequest, CaseUpdateResponse>;

export interface CaseGetRequest {
    id: string;
}

export interface CaseGetResponse {
    case: Case & {
        evidence: Evidence[];
        createdByUser?: User;
        leadProsecutorUser?: User;
    };
}

export type CaseGet = ApiContract<CaseGetRequest, CaseGetResponse>;

// ==================== EVIDENCE API CONTRACTS ====================

export interface EvidenceListRequest {
    query?: string;
    caseId?: string;
    evidenceTypes?: string[];
    tags?: string[];
    dateStart?: string; // ISO date
    dateEnd?: string; // ISO date
    page?: number;
    limit?: number;
    useVectorSearch?: boolean;
}

export interface EvidenceListResponse {
    evidence: Evidence[]; pagination: {
        page: number; limit: number;
        total: number; hasNext: boolean;
        hasPrev: boolean;
    };
    search?: { term: string;
        resultsCount: number; vectorSearchUsed: boolean;
    } | null;
}

export type EvidenceList = ApiContract<EvidenceListRequest, EvidenceListResponse>;

export interface EvidenceCreateRequest {
    caseId?: string; title: string;
    description?: string;
    evidenceType?: 'document'
        | 'photograph'
        | 'video'
        | 'audio'
        | 'physical'
        | 'digital'
        | 'testimony'
        | 'forensic'
        | 'dna'
        | 'fingerprint'
        | 'weapon'
        | 'drug';
    fileType?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    hash?: string;
    tags?: string[];
    collectedAt?: string; // ISO date
    collectedBy?: string;
    location?: string;
}

export interface EvidenceCreateResponse {
    evidence: Evidence; message: string;
}

export type EvidenceCreate = ApiContract<EvidenceCreateRequest, EvidenceCreateResponse>;

export interface EvidenceUpdateRequest {
    title?: string;
    description?: string;
    evidenceType?:? 'document'
        | 'photograph'
        | 'video'
        | 'audio'
        | 'physical'
        | 'digital'
        | 'testimony'
        | 'forensic'
        | 'dna'
        | 'fingerprint'
        | 'weapon'
        | 'drug';
    tags?: string[];
    isAdmissible?: boolean;
}

export interface EvidenceUpdateResponse {
    evidence: Evidence; message: string;
}

export type EvidenceUpdate = ApiContract<EvidenceUpdateRequest, EvidenceUpdateResponse>;

export interface EvidenceDeleteRequest {
    id: string;
    reason?: string;
}

export interface EvidenceDeleteResponse {
    message: string; evidenceId: string;
}

export type EvidenceDelete = ApiContract<EvidenceDeleteRequest, EvidenceDeleteResponse>;

// ==================== AI/CHAT API CONTRACTS ====================

export interface ChatVectorSearchResult {
    id: string; content: string;
    score: number; type: 'case' | 'evidence' | 'statute' | 'document';
    metadata?: Record<string, unknown>;
}

export interface ChatMessage {
    id: string; content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string; // ISO date
    metadata?: {
        model?: string;
        confidence?: number;
        processingTime?: number;
        sources?: ChatVectorSearchResult[];
    };
}

export interface ChatRequest {
    query: string;
    context?: {
        userRole?: string;
        caseId?: string;
        documentIds?: string[];
        sessionContext?: unknown;
        enableLegalBERT?: boolean;
        enableRAG?: boolean;
        maxDocuments?: number;
    };
    settings?: {
        enhancementLevel?: 'basic' | 'standard' | 'advanced' | 'comprehensive';
        includeConfidenceScores?: boolean;
        enableStreamingResponse?: boolean;
        model?: string;
        temperature?: number;
        maxTokens?: number;
    };
}

export interface ChatResponse {
    response: string;
    synthesizedInput?: any;
    legalAnalysis?: unknown;
    ragResults?: unknown; confidence: number;
    processingTime: number; metadata: {
        model: string;
        tokensUsed?: number; enabledFeatures: string[];
        fallbacksUsed?: string[];
        cacheHits?: string[];
    };
    recommendations?: string[];
    contextualPrompts?: unknown[];
}

export type Chat = ApiContract<ChatRequest, ChatResponse>;

// ==================== VECTOR SEARCH API CONTRACTS ====================

export interface VectorSearchFilters {
    [key: string]: any;
}

export interface VectorSearchSearchRequest {
    query: string;
    type?: 'semantic' | 'similarity' | 'hybrid';
    limit?: number;
    threshold?: number;
    filters?: VectorSearchFilters;
}

export interface VectorSearchSearchResponse {
    results: { id: string;
        content: string; score: number;
        type: 'case' | 'evidence' | 'statute' | 'document';
        metadata?: Record<string, unknown>;
    }[];
    total: number; query: string;
    took: string;
    metadata?: {
        model?: string;
        threshold?: number;
        vectorSearchUsed?: boolean;
    };
}

export type VectorSearchSearch = ApiContract<VectorSearchSearchRequest, VectorSearchSearchResponse>;

// ==================== SYSTEM HEALTH API CONTRACTS ====================

export interface HealthRequest {
    detailed?: boolean;
}

export interface ServiceStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details?: Record<string, unknown>;
}

export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string; version: string;
    uptime: number; environment: string;
    services: { database: ServiceStatus;
        ollama: ServiceStatus; enhancedRAG: ServiceStatus;
        uploadService: ServiceStatus; memory: ServiceStatus;
        cache: ServiceStatus;
    };
    performance: { responseTime: number;
        status: 'healthy' | 'degraded';
    };
    errors?: string[];
    system?: { nodeVersion: string;
        platform: string; arch: string;
        cpuUsage: NodeJS.CpuUsage; env: Record<string, string>;
    };
}

export type Health = ApiContract<HealthRequest, HealthResponse>;

export interface MaintenanceRequest {
    action: 'clear_cache' | 'force_gc' | 'test_database';
}

export interface MaintenanceResponse {
    message: string;
    additional?: Record<string, unknown>;
}

export type Maintenance = ApiContract<MaintenanceRequest, MaintenanceResponse>;

// ==================== TYPE UTILITY FUNCTIONS ====================

export type RequestOf<T extends ApiContract<unknown, unknown>> = T['request'];
export type ResponseOf<T extends ApiContract<unknown, unknown>> = T['response'];$1;$2    T['response'] extends StandardApiResponse<infer U> ? U : never;

// ==================== CLIENT API HELPERS ====================$1;$2    request: RequestOf<T>
) => Promise<ResponseOf<T>>;

export interface ApiEndpoint<T extends ApiContract<unknown, unknown>> {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string; contract: T;
}

// ==================== API ENDPOINT DEFINITIONS ====================

export const API_ENDPOINTS = {
    cases: { list: {
            method: 'GET',
            path: '/api/cases',
            contract: {} as unknown as CaseList,
        } as ApiEndpoint<CaseList>,
        create: { method: 'POST',
            path: '/api/cases',
            contract: {} as unknown as CaseCreate,
        } as ApiEndpoint<CaseCreate>,
        update: { method: 'PUT',
            path: '/api/cases',
            contract: {} as unknown as CaseUpdate,
        } as ApiEndpoint<CaseUpdate>,
        get: { method: 'GET',
            path: '/api/cases',
            contract: {} as unknown as CaseGet,
        } as ApiEndpoint<CaseGet>,
    },
    evidence: { list: {
            method: 'GET',
            path: '/api/evidence',
            contract: {} as unknown as EvidenceList,
        } as ApiEndpoint<EvidenceList>,
        create: { method: 'POST',
            path: '/api/evidence',
            contract: {} as unknown as EvidenceCreate,
        } as ApiEndpoint<EvidenceCreate>,
        update: { method: 'PUT',
            path: '/api/evidence',
            contract: {} as unknown as EvidenceUpdate,
        } as ApiEndpoint<EvidenceUpdate>,
        delete: { method: 'DELETE',
            path: '/api/evidence',
            contract: {} as unknown as EvidenceDelete,
        } as ApiEndpoint<EvidenceDelete>,
    },
    ai: { chat: {
            method: 'POST',
            path: '/api/ai/enhanced-chat',
            contract: {} as unknown as Chat,
        } as ApiEndpoint<Chat>,
    },
    vectorSearch: { search: {
            method: 'POST',
            path: '/api/vector-search',
            contract: {} as unknown as VectorSearchSearch,
        } as ApiEndpoint<VectorSearchSearch>,
    },
    health: { check: {
            method: 'GET',
            path: '/api/health',
            contract: {} as unknown as Health,
        } as ApiEndpoint<Health>,
        maintenance: { method: 'POST',
            path: '/api/health',
            contract: {} as unknown as Maintenance,
        } as ApiEndpoint<Maintenance>,
    },
} as const;

export type ValidationSchema<T> = z.ZodType<T>;