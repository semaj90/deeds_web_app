export interface PointStruct {
    id: string | number;
    vector: number[];
    payload?: Record<string, unknown>;
}

export interface SearchRequest {
    vector: number[];
    limit: number;
    filter?: Record<string, unknown>;
    with_payload?: boolean;
    with_vector?: boolean;
    score_threshold?: number;
}

export interface ScoredPoint {
    id: string | number;
    version: number;
    score: number;
    payload?: Record<string, unknown>;
    vector?: number[];
}

export interface SearchResponse {
    result: ScoredPoint[];
    status: string;
    time: number;
}

export interface UpsertPoints {
    points: PointStruct[];
}

export interface UpsertResponse {
    result: {
        operation_id: number;
        status: string;
    };
    status: string;
    time: number;
}
