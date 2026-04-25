// Enhanced REST Architecture for Legal AI
// Provides type-safe API patterns and advanced clustering

export interface APIResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: {
	timestamp: string;
	version: string;
	processing_time: number;
    };
}

export interface ClusteringConfig {
    k: number;
	maxIterations: number;
	tolerance: number;
	algorithm: 'kmeans' | 'som' | 'hierarchical';
}

export interface KMeansConfig extends ClusteringConfig {
    algorithm: 'kmeans';
	distanceMetric: 'euclidean' | 'manhattan' | 'cosine';
    initMethod?: 'random' | 'kmeans++';
}

export interface SOMConfig extends ClusteringConfig {
    algorithm: 'som';
	gridWidth: number;
	gridHeight: number;
	learningRate: number;
    // Add missing properties that SOM service expects
    width: number;
	height: number;
	dimensions: number;
    radius?: number;
    iterations?: number; // Alias for maxIterations
}

export interface DocumentCluster {
    id: string;
	centroid: number[];
	documents: string[];
	size: number;
    label?: string;
    // Additional properties for search results
    similarity?: number;
    metadata?: { [key: string]: any };
    // Additional properties for various search contexts
    documentId?: string;
    embedding?: number[];
    result?: unknown;
}

export interface ClusterResult {
    clusters: DocumentCluster[];
	clusterId: string;
	silhouetteScore: number;
	iterations: number;
	converged: boolean;
}

export class EnhancedRESTClient {
    constructor(private baseURL: string = '/api') {}

    async post<T, U = unknown>(endpoint: string, data: U): Promise<APIResponse<T>> {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(data),
        });
        return response.json();
    }

    async get<T>(endpoint: string): Promise<APIResponse<T>> {
        const response = await fetch(`${this.baseURL}${endpoint}`);
        return response.json();
    }

    async cluster(data: number[][], config: ClusteringConfig): Promise<APIResponse<ClusterResult>> {
        return this.post('/clustering', { data, config });
    }
}

export const restClient = new EnhancedRESTClient();

export class KMeansClusterer {
    constructor(
        public config: KMeansConfig,
        private client: EnhancedRESTClient = restClient
    ) {}

    async cluster(data: number[][]): Promise<APIResponse<ClusterResult>> {
        return this.client.cluster(data, this.config);
    }
}

export class SelfOrganizingMap {
    constructor(
        public config: SOMConfig,
        private client: EnhancedRESTClient = restClient
    ) {}

    async train(data: number[][]): Promise<APIResponse<ClusterResult>> {
        // Assuming the backend /clustering endpoint can handle SOMConfig and dispatch accordingly
        return this.client.cluster(data, this.config);
    }
}

export interface ClusterResultDetails {
    clusters: DocumentCluster[];
	metrics: {
	silhouetteScore: number;
	inertia: number;
	converged: boolean;
    };
}
