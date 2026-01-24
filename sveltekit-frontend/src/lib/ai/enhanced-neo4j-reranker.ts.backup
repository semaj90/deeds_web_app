import type { DocumentItem } from '$lib/types/sharedTypes'; // Use shared type instead of DocumentEmbedding
import type { Driver } from 'neo4j-driver';
import driverFactory, { auth } from 'neo4j-driver';

// Type alias if DocumentEmbedding is used elsewhere
type DocumentEmbedding = DocumentItem;

export type UserContext = {
    user_id: string;
    case_id?: string;
    role: 'prosecutor' | 'detective' | 'admin';
    search_intent: 'evidence' | 'precedent' | 'analysis';
};

export interface EntityRelationship {
    source_entity: string;
    target_entity: string;
    relationship_type: 'references' | 'contradicts' | 'supports' | 'contains';
    confidence: number;
    legal_weight: number;
    source_document: string;
}

export interface ConfidenceScores {
    legal_relevance: number;
    factual_accuracy: number;
    chain_of_custody: number;
    precedent_strength: number;
    overall_confidence: number;
}

export interface AuditEntry {
    timestamp: number;
    action: 'query' | 'rerank' | 'search' | 'score_adjustment';
    user_id: string;
    query_hash: string;
    score_before?: number;
    score_after?: number;
    reasoning: string;
}

export interface Neo4jPathContext {
    document_id: string;
    case_id: string;
    evidence_chain: string[];
    legal_precedents: string[];
    entity_relationships: EntityRelationship[];
    confidence_scores: ConfidenceScores;
    audit_trail: AuditEntry[];
}

export interface EnhancedRerankerConfig {
    enable_neo4j_paths: boolean;
    enable_boolean_patterns: boolean;
    accuracy_threshold: number;
    max_path_depth: number;
    legal_weight_multiplier: number;
    audit_enabled: boolean;
    neo4j_bolt_url?: string;
}

export interface RerankingResult {
    document_id: string;
    original_score: number;
    enhanced_score: number;
    neo4j_boost: number;
    boolean_pattern_match: boolean[][];
    confidence_metrics: ConfidenceScores;
    path_context: Neo4jPathContext;
    explanation: string;
}

type SegmentLike = {
    start?: { properties?: Record<string, unknown> };
    end?: { properties?: Record<string, unknown> };
    type?: string;
};

export class EnhancedNeo4jReranker {
    private auditLog: AuditEntry[] = [];
    private isInitialized = false;
    private config: EnhancedRerankerConfig;
    private neo4jDriver: Driver | null = null;

    constructor(config: Partial<EnhancedRerankerConfig> = {}) {
        this.config = {
            enable_neo4j_paths: true,
            enable_boolean_patterns: true,
            accuracy_threshold: 0.5,
            max_path_depth: 5,
            legal_weight_multiplier: 1.0,
            audit_enabled: false,
            ...config
        };
    }

    async initialize(): Promise<void> {
        const boltUrl = this.config.neo4j_bolt_url || process.env.NEO4J_BOLT_URL;
        if (boltUrl) {
            try {
                this.neo4jDriver = driverFactory.driver(
                    boltUrl,
                    auth.basic(process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'test')
                );

                const session = this.neo4jDriver.session();
                try {
                    await session.run('RETURN 1');
                } finally {
                    await session.close();
                }
                console.log('✅ Neo4j driver initialized');
            } catch (e) {
                console.warn('Neo4j not available or driver not installed; continuing with mock path context', String(e));
                this.neo4jDriver = null;
            }
        }
        this.isInitialized = true;
    }

    async enhancedRerank(
        query: string,
        documents: Array<DocumentEmbedding | unknown>,
        userContext: UserContext
    ): Promise<RerankingResult[]> {
        if (!this.isInitialized) throw new Error('Reranker not initialized');
        const start = Date.now();
        const results: RerankingResult[] = [];

        for (const raw of documents) {
            const doc = this.ensureDocumentEmbedding(raw);
            try {
                const original = await this.calculateSemanticSimilarity(query, doc);
                const path = await this.getNeo4jPathContext(doc, userContext);
                const conf = this.getDefaultConfidenceScores();
                const enhanced = Math.min(original + path.evidence_chain.length * 0.02, 1.0);

                results.push({
                    document_id: String(doc.id),
                    original_score: original,
                    enhanced_score: enhanced,
                    neo4j_boost: enhanced - original,
                    boolean_pattern_match: [[false]],
                    confidence_metrics: conf,
                    path_context: path,
                    explanation: 'computed'
                });
            } catch (err) {
                const safeDoc = this.ensureDocumentEmbedding(raw);
                results.push({
                    document_id: String(safeDoc.id),
                    original_score: 0,
                    enhanced_score: 0,
                    neo4j_boost: 0,
                    boolean_pattern_match: [[false]],
                    confidence_metrics: this.getDefaultConfidenceScores(),
                    path_context: this.getDefaultPathContext(safeDoc),
                    explanation: String(err)
                });
            }
        }

        results.sort((a, b) => b.enhanced_score - a.enhanced_score);
        const filtered = results.filter(
            (r) => (r.confidence_metrics?.overall_confidence ?? 0) >= this.config.accuracy_threshold
        );

        console.log(`Enhanced rerank completed in ${Date.now() - start}ms, returned ${filtered.length}/${results.length}`);
        return filtered;
    }

    private ensureDocumentEmbedding(raw: any): DocumentEmbedding {
        if (!raw || typeof raw !== 'object') {
            return { id: 'unknown', content: '', embeddings: [], metadata: {} } as unknown as DocumentEmbedding;
        }
        const r = raw as Record<string, unknown>;
        const id = typeof r['id'] === 'string' ? (r['id'] as string)
            : typeof r['document_id'] === 'string' ? (r['document_id'] as string)
            : 'unknown';
        const content = typeof r['content'] === 'string' ? (r['content'] as string)
            : typeof r['text'] === 'string' ? (r['text'] as string)
            : '';
        const embeddings = Array.isArray(r['embedding']) ? (r['embedding'] as number[]) : [];
        const metadata = typeof r['metadata'] === 'object' && r['metadata'] !== null ? (r['metadata'] as Record<string, unknown>) : {};

        return { id, content, embeddings, metadata } as unknown as DocumentEmbedding;
    }

    private async getNeo4jPathContext(document: DocumentEmbedding, userContext: UserContext): Promise<Neo4jPathContext> {
        if (this.neo4jDriver) {
            let session;
            try {
                session = this.neo4jDriver.session();
                const depth = this.config.max_path_depth ?? 3;
                const cypher = `MATCH (d:Document {id: $id})-[r*1..${depth}]-(n) RETURN d, r, n LIMIT 50`;
                const res = await session.run(cypher, { id: document.id });

                const evidence_chain: string[] = [];
                const legal_precedents: string[] = [];
                const entity_relationships: EntityRelationship[] = [];

                for (const rec of res.records) {
                     // Simplified extraction logic for this rewrite
                }

                return {
                    document_id: String(document.id),
                    case_id: userContext.case_id ?? 'UNKNOWN',
                    evidence_chain,
                    legal_precedents,
                    entity_relationships,
                    confidence_scores: this.getDefaultConfidenceScores(),
                    audit_trail: []
                };

            } catch (e) {
                console.warn('Neo4j query failed, falling back to mock path context', String(e));
            } finally {
                if (session) {
                    try { await session.close(); } catch {}
                }
            }
        }

        return this.getDefaultPathContext(document);
    }

    private async calculateSemanticSimilarity(_q: string, document: DocumentEmbedding): Promise<number> {
        // Mock similarity logic
        const content = document.content || '';
        const words = content.toLowerCase().split(/\s+/).filter(Boolean);
        return Math.min(words.length / 10, 1.0);
    }

    private getDefaultConfidenceScores(): ConfidenceScores {
        return {
            legal_relevance: 0.6,
            factual_accuracy: 0.7,
            chain_of_custody: 0.6,
            precedent_strength: 0.5,
            overall_confidence: 0.65
        };
    }

    private getDefaultPathContext(document: DocumentEmbedding): Neo4jPathContext {
        return {
            document_id: String(document.id),
            case_id: 'UNKNOWN',
            evidence_chain: [],
            legal_precedents: [],
            entity_relationships: [],
            confidence_scores: this.getDefaultConfidenceScores(),
            audit_trail: []
        };
    }

    getAuditTrail(): AuditEntry[] {
        return [...this.auditLog];
    }
}

export const neo4jReranker = new EnhancedNeo4jReranker();

export function createEnhancedNeo4jReranker(config: Partial<EnhancedRerankerConfig> = {}) {
    return new EnhancedNeo4jReranker(config);
}
