import { ENV } from '$lib/server/env.server.js';
const env: Record<string, string | undefined> = { ...process.env, ...ENV } as any;
import type { PointStruct, SearchRequest, SearchResponse, UpsertPoints, UpsertResponse } from '$lib/types/qdrant';
import { parseQdrantJsonResponse } from './utils/qdrant-parser.js';

const QDRANT_COLLECTION_NAME = 'legal_documents';

function logTrace(trace: any) {
  console.debug(`[QdrantParserTrace] parser=${trace.parser} bytes=${trace.responseBytes} op=${trace.qdrantOperation}`);
}

/**
 * Upserts points (vectors and payloads) into a Qdrant collection.
 * @param {PointStruct[]} points An array of points to upsert.
 * @returns {Promise<UpsertResponse>} The response from the Qdrant upsert operation.
 */
export async function upsertVectors(points: PointStruct[]): Promise<UpsertResponse> {
    try {
        const response = await fetch(`${env.QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}/points`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': env.QDRANT_API_KEY as string
            },
            body: JSON.stringify({ points, wait: true } as UpsertPoints)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Qdrant upsert error, ${response.status} - ${errorBody}`);
        }

        return await parseQdrantJsonResponse<UpsertResponse>(response, {
            qdrantOperation: 'upsert',
            onTrace: logTrace
        });
    } catch (error) {
        console.error('Error upserting vectors to Qdrant: ', error);
        throw error;
    }
}

/**
 * Searches for similar vectors in a Qdrant collection.
 * @param {SearchRequest} searchRequest The search query including vector and filters.
 * @returns {Promise<SearchResponse>} The search results from Qdrant.
 */
export async function searchVectors(searchRequest: SearchRequest): Promise<SearchResponse> {
    try {
        const response = await fetch(`${env.QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}/points/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': env.QDRANT_API_KEY as string
            },
            body: JSON.stringify({
                query: searchRequest.vector,
                limit: searchRequest.limit,
                filter: searchRequest.filter,
                with_payload: searchRequest.with_payload,
                with_vector: searchRequest.with_vector,
                score_threshold: searchRequest.score_threshold,
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Qdrant search error, ${response.status} - ${errorBody}`);
        }

        const parsed = await parseQdrantJsonResponse<{
            result?: { points?: SearchResponse['result'] };
            status: string;
            time: number;
        }>(response, {
            qdrantOperation: 'search',
            onTrace: logTrace
        });
        return { ...parsed, result: parsed.result?.points ?? [] };
    } catch (error) {
        console.error('Error searching vectors in Qdrant: ', error);
        throw error;
    }
}
