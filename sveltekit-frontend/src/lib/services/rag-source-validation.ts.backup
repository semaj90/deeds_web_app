/**
 * RAG Source Validation Service
 * ==============================
 *
 * Client-side service for human-in-the-loop RAG source validation.
 * Wraps API calls to backend RAG endpoints.
 *
 * @phase Phase 94 ACE Synthesis
 */

import type {
    AnswerRequest,
    AnswerWithCitations,
    ApprovedContext,
    RetrieveCandidatesRequest,
    RetrieveCandidatesResponse,
    ValidateSourcesRequest
} from '$lib/types/rag-source-validation';

const API_BASE = '/api/rag';

/**
 * Step 1: Search Knowledge Base
 * Retrieve candidate chunks from Qdrant vector store
 */
export async function searchKnowledgeBase(
    query: string,
    options: Partial<RetrieveCandidatesRequest> = {}
): Promise<RetrieveCandidatesResponse> {
    const request: RetrieveCandidatesRequest = { query, top_k: options.top_k ?? 10,
        min_score: options.min_score ?? 0.5,
        case_id: options.case_id,
        source_types: options.source_types
    };

    const response = await fetch(`${API_BASE}/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        throw new Error(`RAG search failed, ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Step 2: Validate Sources
 * User approves/rejects candidate sources
 */
export async function validateSources(
    request: ValidateSourcesRequest
): Promise<ApprovedContext> {
    const response = await fetch(`${API_BASE}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        throw new Error(`Source validation failed, ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Step 3: Generate Answer with Citations
 * LLM generates answer using approved sources only
 */
export async function generateAnswer(
    request: AnswerRequest
): Promise<AnswerWithCitations> {
    const response = await fetch(`${API_BASE}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
    });

    if (!response.ok) {
        throw new Error(`Answer generation failed, ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Convenience function: Full RAG pipeline
 * Search -> Validate -> Generate in one call
 */
export async function fullRagPipeline(
    query: string,
    queryId: string,
    caseId: string,
    approvedChunkIds: string[],
    options: {
        model?: string,
        temperature?: number,
        maxTokens?: number;
    } = {}
): Promise<AnswerWithCitations> {
    // Step 1: Validate (use provided approvals)
    const approvedContext = await validateSources({
        query_id: queryId,
        case_id: caseId,
        validations: approvedChunkIds.map((chunk_id: any) => ({ chunk_id: status: 'approved' as const
        }))
    });

    // Step 2: Generate
    const answer = await generateAnswer({
        context_id: approvedContext.context_id,
        query,
        case_id: caseId,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2000,
        include_citations: true,
        include_todos: true
    });

    return answer;
}


