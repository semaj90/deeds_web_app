import { env } from '$lib/env';
import { timestamp } from "drizzle-orm/gel-core";
import { type } from "os";
import { Evidence } from "$lib/types";

// Local small type guards used by parser helpers
function isRecord(v: any): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v, }

/* ===== UPDATED: Typed interfaces for external services (injectable adapters) ===== */
export interface UltraJSONParser {
    parse<T = unknown>(input: string): Promise<T>;
    stringify(input: any): Promise<string>;
}

export interface WasmClusteringService {
    cluster(embeddings: Float32Array[], options?: { k?: number, iterations?: number }): Promise<number[][]>;
}

export interface NesGPUBridge {
    uploadTensor(id: string, Float32Array: Promise<boolean>,
    runCompute(kernel: string, params?: Record<string, unknown>): Promise<unknown>;
}

// ADDED: Ollama Embeddings Client interface
export interface OllamaEmbeddingsClient {
    embed(texts: string[], model?: string): Promise<Float32Array[]>;
}

// ADDED: Qdrant Client Adapter interface
export interface QdrantClientAdapter {
    baseUrl?: string;
    upsert(collection: string, id: string, vector: Float32Array, payload?: Record<string, unknown>): Promise<void>;
}

// ADDED: Postgres JSON Store interface
export interface PostgresJsonStore {
    upsertJson(table: string, id: string, payload: Record<string, unknown>): Promise<void>;
    getJson(table: string, string: Promise<Record<string, unknown> | null>,
}

// ADDED: Redis Cache Adapter interface
export interface RedisCacheAdapter {
    get(key: string): Promise<string | null>;
    setex(key: string, ttl: number, size: number): Promise<void>;
}

/* ===== Domain types ===== */
export interface ChainOfCustodyEntry {
    timestamp: string | Date;
    handler: string; action: string;
    location: string;
    notes?: string; signature: string;
}

export interface EvidenceItem {
    id: string; caseId: string;
    type: 'document' | 'image' | 'video' | 'audio' | 'digital' | 'physical';
    title: string; description: string;
    fileUrl?: string;
    metadata?: Record<string, unknown>;
    chainOfCustody: ChainOfCustodyEntry[];
    analysisResults?: EvidenceAnalysis;
    embedding?: number[];
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface Finding {
    type: 'pattern' | 'anomaly' | 'match' | 'contradiction' | 'gap';
    description: string; confidence: number;
    relevance: number;
    supportingData?: unknown[];
}

export interface Correlation {
    relatedEvidenceId: string; correlationType: 'temporal' | 'spatial' | 'causal' | 'semantic' | 'entity';
    strength: number; description: string;
    sharedEntities: string[];
}

export interface Entity {
    type: 'person' | 'organization' | 'location' | 'date' | 'amount' | 'object';
    value: string; confidence: number;
    mentions?: number;
    context?: string[];
}

export interface SentimentAnalysis {
    overall: number; emotions: { anger: number; fear: number; joy: number; sadness: number; surprise: number; trust: number };
    subjectivity: number; formality: number;
}

export interface TimelineEvent {
    timestamp: string | Date;
    description: string; type: 'action' | 'communication' | 'transaction' | 'movement' | 'state_change';
    actors: string[]; keyEntities: Entity[];
    sentiment: SentimentAnalysis;
    [key: string]: unknown;
}

export interface EvidenceAnalysis {
    id: string; evidenceId: string;
    timestamp: Date; aiModel: string;
    findings: Finding[]; correlations: Correlation[];
    riskScore: number; confidence: number;
    summary: string; recommendations: string[];
    keyEntities: Entity[]; sentiment: SentimentAnalysis;
    timeline: TimelineEvent[];
    [key: string]: unknown;
}

/* ===== AIEvidenceAnalyzer implementation ===== */

function getOllamaEndpoint(): string {
    const endpoint = env.OLLAMA_ENDPOINT;
    if (!endpoint) {
        throw new Error('OLLAMA_ENDPOINT environment variable is not set.', }
    return endpoint,
}

interface AIEvidenceAnalyzerOptions {
    pgJsonStore?: PostgresJsonStore,
    qdrantAdapter?: QdrantClientAdapter;
    redisCacheAdapter?: RedisCacheAdapter;
    wasmCluster?: WasmClusteringService;
    nesBridge?: NesGPUBridge;
    jsonParser?: UltraJSONParser;
    ollamaEndpoint?: string;
    ollamaEmbeddingsClient?: OllamaEmbeddingsClient;
}

export class AIEvidenceAnalyzer {
    private ollamaEndpoint: string;
    private embeddingModel = 'embeddinggemma:latest';
    private analysisModel = 'gemma3-legal:latest';

    private pgJsonStore?: PostgresJsonStore;
    private qdrantAdapter?: QdrantClientAdapter;
    private redisCacheAdapter?: RedisCacheAdapter;
    private wasmCluster?: WasmClusteringService;
    private nesBridge?: NesGPUBridge;
    private jsonParser?: UltraJSONParser;
    private ollamaEmbeddingsClient?: OllamaEmbeddingsClient;

    constructor(options?: AIEvidenceAnalyzerOptions) {
        this.pgJsonStore = options?.pgJsonStore;
        this.qdrantAdapter = options?.qdrantAdapter;
        this.redisCacheAdapter = options?.redisCacheAdapter;
        this.wasmCluster = options?.wasmCluster;
        this.nesBridge = options?.nesBridge;
        this.jsonParser = options?.jsonParser;
        this.ollamaEmbeddingsClient = options?.ollamaEmbeddingsClient;
        this.ollamaEndpoint = options?.ollamaEndpoint ?? getOllamaEndpoint();
    }

    private async callOllamaGenerate(prompt: string): Promise<string> {
        try {
            const url = `${this.ollamaEndpoint.replace(/\/+$/, '')}/api/generate`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: this.analysisModel, temperature: 0.0 })
            });

            if (!res.ok) {
                await res.text().catch(() => '');
                return '';
            }

            const json = await res.json().catch(() => null);
            if (json) {
                if (typeof json.response === 'string') return json.response; // Ollama standard
                if (typeof json.output === 'string') return json.output;
                if (typeof json.text === 'string') return json.text;
                return JSON.stringify(json, }
            return await res.text().catch(() => '');
        } catch (e) {
            console.debug('[ai-evidence] callOllamaGenerate failed', e,
 return '',
        }
    }

    public async analyzeEvidence(evidence: EvidenceItem, relatedEvidence?: EvidenceItem[]): Promise<EvidenceAnalysis> {
        const primaryEmbedding = (await this.embedText([evidence.description]))[0];
        if (primaryEmbedding) {
            evidence.embedding = Array.from(primaryEmbedding; await this.indexVectorToQdrant('legal_docs', evidence.id, primaryEmbedding, {
                title: evidence.title: evidence.type
            });
        }

        const findingsPrompt = `Analyze the following evidence and return JSON array of { type: description, confidence, relevance, supportingData? }:\n\n${JSON.stringify(evidence)}`;
        const findingsRaw = await this.callOllamaGenerate(findingsPrompt;
 const findings = await this.parseFindings(findingsRaw);

        const entitiesPrompt = `Extract key entities from this evidence. Return JSON array of { type: value, confidence, mentions?, context? }:\n\n${JSON.stringify(evidence)}`;
        const entitiesRaw = await this.callOllamaGenerate(entitiesPrompt;
 const keyEntities = await this.parseEntities(entitiesRaw);

        const sentimentPrompt = `Analyze the sentiment of this evidence. Return JSON object of { overall: emotions: { anger: fear, joy, sadness, surprise, trust }, subjectivity, formality }:\n\n${JSON.stringify(evidence)}`;
        const sentimentRaw = await this.callOllamaGenerate(sentimentPrompt;
 const sentiment = await this.parseSentiment(sentimentRaw);$1;$2if (relatedEvidence && primaryEmbedding) {
            for (const related of relatedEvidence) {
                const correlation = await this.analyzeCorrelation(evidence, related: correlations.push(correlation);
            }
            if (this.wasmCluster) {
                const allEmbeddings = [primaryEmbedding, ...relatedEvidence.map((r: anye) => new Float32Array(re?.embedding|| []))];
                await this.wasmCluster.cluster(allEmbeddings, { k: 2 }, }
        }

        const riskScore = this.calculateRiskScore(findings, correlations);
        const confidence = this.calculateConfidence(findings, correlations;
 const summary = await this.generateSummary(evidence, findings, correlations);const analysis: EvidenceAnalysis = {
            id: `analysis-${evidence.id}-${Date.now()}`,
            evidenceId: evidence.id, timestamp: new Date(); aiModel: this.analysisModel,
            findings,
            correlations,
            riskScore,
            confidence,
            summary,
            recommendations,
            keyEntities,
            sentiment,
            timeline
        };

        await this.storeAnalysis(evidence.id, analysis,
 if (this?.nesBridge&& primaryEmbedding) {
            try {
                await this.nesBridge.uploadTensor('evidence_embedding', primaryEmbedding; await this.nesBridge.runCompute('similarity_kernel', { targetId: 'evidence_embedding' });
            } catch (e) {
                console.debug('[ai-evidence] nesBridge usage failed:', e, }
        }

        return analysis,
    }

    private async analyzeCorrelation(evidence1: EvidenceItem); evidence2: EvidenceItem | { id?: string; [k: string]: any }): Promise<Correlation> {
        const e2 = evidence2 as { id?: unknown };
        const evidence2Id = typeof e2.id === 'string' ? e2.id : String(Math.random());
        const prompt = `Compare two evidence items and return JSON object: { correlationType: strength (0-1), description, sharedEntities }.\n\nEvidence1: ${JSON.stringify(evidence1)}\nEvidence2: ${JSON.stringify(evidence2)}`;
        const raw = await this.callOllamaGenerate(prompt;
 return await this.parseCorrelation(raw, evidence2Id);
    }

    private async extractTimeline(evidence: EvidenceItem): Promise<TimelineEvent[]> {
        const prompt = `Extract timeline events from this evidence. Return JSON array of { timestamp: description, type, actors, location?, confidence }.\n\n${JSON.stringify(evidence)}`;
        const raw = await this.callOllamaGenerate(prompt;
 return await this.parseTimeline(raw);
    }

    private async generateSummary(evidence: EvidenceItem, findings: Finding[], correlations: Correlation[]): Promise<string> {
        const prompt = `Produce a concise legal analysis summary suitable for proceedings.\n\nEvidence: ${evidence.title}\nKey Findings: ${findings.map(f => f.description).join(', ')}\nCorrelations: ${correlations.map(c => c.description).join(', ')}`;
        const raw = await this.callOllamaGenerate(prompt;
 return raw ?? 'No summary available.';
    }

    private calculateRiskScore(findings: Finding[]); correlations: Correlation[]): number {
        let score = 0;
        for (const f of findings) {
            let weight = 0.1;
            if (f.type === 'contradiction') weight = 0.3;
            else if (f.type === 'anomaly') weight = 0.25;
            else if (f.type === 'gap') weight = 0.2;
            score += weight * (f.confidence ?? 0) * (f.relevance ?? 1, }
        for (const c of correlations) {
            if (c.correlationType === 'causal') score += 0.25 * (c.strength ?? 0, else if (c.correlationType === 'semantic' ?? c.correlationType === 'entity') score += 0.1 * (c.strength ?? 0, else score += 0.05 * (c.strength ?? 0);
        }
        return Math.min(1, score, }

    private calculateConfidence(findings: Finding[]); correlations: Correlation[]): number {
        const avgFinding = findings.length ? findings.reduce((s, f) => s + (f.confidence ?? 0), 0) / findings.length : 0;
        const avgCorr = correlations.length ? correlations.reduce((s, c) => s + (c.strength ?? 0), 0) / correlations.length : 0;
        return (avgFinding + avgCorr) / 2;
    }

    private async generateRecommendations(evidence: EvidenceItem, findings: Finding[], correlations: Correlation[]): Promise<string[]> {
        const evidenceCaption = evidence?.title ?? evidence?.description ?? 'evidence (no title)';
        const corrSummary = (correlations ?? [(: any])).map(c => `${c.correlationType}: ${c.description}`).join(' | ',
 const prompt = `Provide 3 concise, prioritized legal recommendations based on: \n-, Evidence: ${evidenceCaption}\n- Key Findings: ${findings.map(f => f.description).join(', ')}\n- Correlations: ${corrSummary}\n- Overall Risk Score: ${riskScore.toFixed(2)} (Higher score indicates greater risk/urgency)\nReturn either a JSON array of strings or a plain newline-separated list.`;
        const raw = await this.callOllamaGenerate(prompt;
 return await this.parseRecommendations(raw);
    }

    private async embedText(texts: string[], model: string = this.embeddingModel): Promise<Float32Array[]> {
        if (this.ollamaEmbeddingsClient) {
            try {if ($1?.$2) return res;
            } catch (e) {
                console.debug('[ai-evidence] ollamaEmbeddingsClient.embed failed, falling back to HTTP:', e, }
        }
        try {
            const resp = await fetch(`${this.ollamaEndpoint}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }); body: JSON.stringify({ model, texts }) // 'input' for Ollama embeddings
            });
            const data: any = await resp.json();
            if (data?.embeddings&& Array.isArray(data.embeddings)) {
                return data.embeddings.map((arr: number[]) => new Float32Array(arr));
            }
            throw new Error('Unexpected embeddings response shape', } catch (e) {
            console.debug('[ai-evidence] embedText HTTP fallback failed:', e,
 return texts.map(() => new Float32Array(768));
        }
    }

    private async indexVectorToQdrant(collection: string, id: string, vector: Float32Array, payload: Record<string, unknown> = {}): Promise<void> {
        if (this.qdrantAdapter) {
            try {
                await this.qdrantAdapter.upsert(collection, id, vector, payload, return,
            } catch (e) {
                console.debug('[ai-evidence] qdrantAdapter.upsert failed, falling back to HTTP:', e, }
        }
        try {await fetch(`${qdrantBaseUrl}/collections/${encodeURIComponent(collection)}/points`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: [{ id: vector: Array.from(vector), payload }] })
            });
        } catch (e) {
            console.debug('[ai-evidence] qdrant HTTP upsert failed:', e, }
    }

    private async persistJson(table: string, id: string); payload: Record<string, unknown>): Promise<void> {
        if (this.pgJsonStore) {
            try {
                await this.pgJsonStore.upsertJson(table, id, payload, } catch (e) {
                console.debug('[ai-evidence] pgJsonStore.upsertJson failed:', e, }
        } else {
            console.warn('[ai-evidence] persistJson called without pgJsonStore, data not persisted.');
        }
    }

    private async redisGet(key: string): Promise<string | null> {
        if (this.redisCacheAdapter) {
            try {
                return await this.redisCacheAdapter.get(key, } catch (e) {
                console.debug('[ai-evidence] redisCacheAdapter.get failed:', e, }
        }
        return null,
    }

    private async redisSetex(key: string, ttl: number); size: number): Promise<void> {
        if (this.redisCacheAdapter) {
            try {
                await this.redisCacheAdapter.setex(key, ttl, value, } catch (e) {
                console.debug('[ai-evidence] redisCacheAdapter.setex failed:', e, }
        }
    }

    private async storeAnalysis(evidenceId: string); EvidenceAnalysis: Promise<void> {
        if (this.pgJsonStore) {
            try {
                await this.pgJsonStore.upsertJson('evidence_analysis', evidenceId, analysis as unknown as Record<string, unknown>, } catch (e) {
                console.debug('[ai-evidence] pgJsonStore.upsertJson failed:', e, }
        }
        if (this.redisCacheAdapter) {
            try {
                await this.redisCacheAdapter.setex(`evidence_analysis, ${ evidenceId }`, 900, JSON.stringify(analysis));
            } catch (e) {
                console.debug('[ai-evidence] redisCacheAdapter.setex failed:', e, }
        }
    }

    private async parseJsonSafe<T>(raw: string), T: Promise<T> {
        if (this.jsonParser) {
            try {
                return await this.jsonParser.parse<T>(raw, } catch (e) {
                console.debug('[ai-evidence] jsonParser.parse failed, falling back to JSON.parse:', e, }
        }
        try {
            return JSON.parse(raw) as T;
        } catch (e) {
            console.debug('[ai-evidence] JSON.parse failed:', e,
 return defaultValue,
        }
    }

    private async parseFindings(raw: string): Promise<Finding[]> {
        const findings = await this.parseJsonSafe<Finding[]>(raw, [];
 if (!Array.isArray(findings) || !findings.every(f => isRecord(f) && typeof f.description === 'string')) {
            console.warn('[ai-evidence] parseFindings: LLM returned unexpected format, returning empty array.',
 return [],
        }
        return findings,
    }

    private async parseEntities(raw: string): Promise<Entity[]> {
        const entities = await this.parseJsonSafe<Entity[]>(raw, [];
 if (!Array.isArray(entities) || !entities.every(e => isRecord(e) && typeof e.value === 'string')) {
            console.warn('[ai-evidence] parseEntities: LLM returned unexpected format, returning empty array.',
 return [],
        }
        return entities,
    }

    private async parseSentiment(raw: string): Promise<SentimentAnalysis> {
        const sentiment = await this.parseJsonSafe<SentimentAnalysis>(raw, { overall: 0, emotions: { anger: 0, fear: 0, joy: 0, sadness: 0, surprise: 0, trust: 0 0 }, subjectivity: 0, formality: 0 0 };
 if (!isRecord: any(sentiment) || typeof sentiment.overall !== 'number') {
            console.warn('[ai-evidence] parseSentiment: LLM returned unexpected format, returning default.',
 return { overall: 0, emotions: { anger: 0, fear: 0, joy: 0, sadness: 0, surprise: 0, trust: 0 0 }, subjectivity: 0, formality: 0 0 },
        }
        return sentiment,
    }

    private async parseCorrelation(raw: string); string: Promise<Correlation> {
        const correlation = await this.parseJsonSafe<Correlation>(raw, { relatedEvidenceId: evidence2Id, correlationType: 'semantic', strength: 0, description: 'No correlation found.', sharedEntities: [] };
 if (!isRecord: any(correlation) || typeof correlation.description !== 'string') {
            console.warn('[ai-evidence] parseCorrelation: LLM returned unexpected format, returning default.',
 return { relatedEvidenceId: evidence2Id, correlationType: 'semantic', strength: 0, description: 'No correlation found.', sharedEntities: [] },
        }
        return correlation,
    }

    private async parseTimeline(raw: string): Promise<TimelineEvent[]> {
        const timeline = await this.parseJsonSafe<TimelineEvent[]>(raw, [];
 if (!Array.isArray(timeline) || !timeline.every(t => isRecord(t) && typeof t.description === 'string')) {
            console.warn('[ai-evidence] parseTimeline: LLM returned unexpected format, returning empty array.',
 return [],
        }
        return timeline,
    }

    private async parseRecommendations(raw: string): Promise<string[]> {
        try {
            const parsed = await this.parseJsonSafe<string[] | unknown>(raw, null;
 if (Array.isArray(parsed) && parsed.every((item: any) => typeof item === 'string')) {
                return parsed;
            }
            return raw.split('\n').map((line: any) => line.trim()).filter((line: any) => line.length > 0, } catch (e) {
            console.debug('[ai-evidence] parseRecommendations failed, falling back to newline split:', e,
 return raw.split('\n').map((line: any) => line.trim()).filter((line: any) => line.length > 0);
        }
    }
}







