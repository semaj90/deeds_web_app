/**
 * Comprehensive TypeScript Types for LangChain-Ollama Integration
 * Production-ready types for legal AI system with advanced features
 */

import type { SearchResult } from '/types';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

// Core AI Model Types
export interface AIModel {
 id: string;
	name: string;
 provider: 'ollama' | 'openai' | 'anthropic' | 'local';
 type: 'chat' | 'embedding' | 'completion' | 'multimodal';
 version: string;
	parameters: ModelParameters;
 capabilities: ModelCapabilities;
	metadata: ModelMetadata;
}

export interface ModelParameters {
 temperature: number;
	topP: number;
 topK: number;
	maxTokens: number;
 contextLength: number;
	repeatPenalty: number;
 seed?: number;
 stop?: string[];
 // Ollama-specific parameters
 numCtx?: number;
 numBatch?: number;
 numGpu?: number;
 mainGpu?: number;
 lowVram?: boolean;
 f16Kv?: boolean;
 useMmap?: boolean;
 useMlock?: boolean;
 numThread?: number;
}

export interface ModelCapabilities {
 supportsStreaming: boolean;
	supportsChat: boolean;
 supportsFunctionCalling: boolean;
	supportsVision: boolean;
 supportsDocuments: boolean;
	maxContextLength: number;
 languagesSupported: string[];
	specializations: string[];
}

export interface ModelMetadata {
 size: number;
	parametersCount: string;
 quantization?: string;
	architecture: string;
 trainedOn: string[];
	license: string;
 created: string;
	updated: string;
 tags: string[];
}

export interface EmbeddingModel extends AIModel {
 dimensions: number;
	normalization: boolean;
 similarity: 'cosine' | 'euclidean' | 'dot_product';
 batchSize: number;
}

export interface EmbeddingVector {
 id: string;
	vector: number[];
 metadata: EmbeddingMetadata;
}

export interface EmbeddingMetadata {
 source: string;
	sourceType: 'document' | 'chunk' | 'query' | 'knowledge_base';
 createdAt: string;
	model: string;
 dimensions: number;
	tokenCount: number;
 processingTime: number;
	tags: string[];
 [key: string]: unknown;
}

export interface SimilarityResult {
 id: string;
	score: number;
 metadata: EmbeddingMetadata;
	content: string;
 vector?: number[];
}

// Vector Database Types
export interface VectorDatabase {
 type: 'pgvector' | 'qdrant' | 'pinecone' | 'weaviate' | 'chroma';
 connection: VectorDBConnection;
	collections: VectorCollection[];
 indices: VectorIndex[];
	config: VectorDBConfig;
}

export interface VectorDBConnection {
 host: string;
	port: number;
 database: string;
 username?: string;
 password?: string;
 ssl?: boolean;
 poolSize?: number;
 timeout?: number;
}

export interface VectorCollection {
 name: string;
	dimensions: number;
 metric: 'cosine' | 'euclidean' | 'dot_product';
 vectorCount: number;
	indexType: 'ivfflat' | 'hnsw' | 'exact';
 metadata: Record<string, unknown>;
 created: string;
	updated: string;
}

export interface VectorIndex {
 name: string;
	collection: string;
 type: 'ivfflat' | 'hnsw' | 'exact';
 parameters: Record<string, unknown>;
 performance: IndexPerformance;
}

export interface IndexPerformance {
 queryTime: number;
	accuracy: number;
 memoryUsage: number;
	buildTime: number;
}

export interface VectorDBConfig {
 maxConnections: number;
	connectionTimeout: number;
 queryTimeout: number;
	batchSize: number;
 enableCompression: boolean;
	enableEncryption: boolean;
 indexingStrategy: 'eager' | 'lazy' | 'batch';
 replicationFactor: number;
}

// LangChain Integration Types
export interface LangChainChain {
 id: string;
	name: string;
 type: ChainType;
	config: ChainConfig;
 components: ChainComponent[];
	memory: ChainMemory;
 tools: ChainTool[];
	status: ChainStatus;
}
| 'conversation'
 | 'qa'
 | 'summarization'
 | 'analysis'
 | 'retrieval'
 | 'agent'
 | 'workflow'
 | 'custom';

export interface ChainComponent<TConfig = Record<string, unknown>> {
 id: string;
	type: 'llm' | 'prompt' | 'memory' | 'tool' | 'parser' | 'retriever';
 name: string;
	config: TConfig;
 inputs: string[];
	outputs: string[];
 dependencies: string[];
}

export interface ChainConfig {
 temperature: number;
	maxTokens: number;
 streaming: boolean;
	verbose: boolean;
 returnIntermediateSteps: boolean;
	maxIterations: number;
 timeout: number;
 retryOptions?: RetryOptions;
}

export interface ChainMemory {
 type: 'buffer' | 'summary' | 'vector' | 'knowledge_graph' | 'entity';
 maxTokens: number;
	returnMessages: boolean;
 inputKey: string;
	outputKey: string;
 memoryKey: string;
	aiPrefix: string;
 humanPrefix: string;
	config: Record<string, unknown>;
}

export interface ChainTool {
 name: string;
	description: string;
 parameters: ToolParameters;
	handler: string;
 async: boolean;
	timeout: number;
 retries: number;
}

export interface ToolParameters {
 type: 'object';
	properties: Record<string: ParameterProperty>;
	required: string[];
}

export interface ParameterProperty {
 type: string;
	description: string;
 enum?: string[];
 default?: unknown;
 minimum?: number;
 maximum?: number;
 pattern?: string;
}

export type ChainStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

export interface RetryOptions {
 maxRetries: number;
	backoffMultiplier: number;
 maxBackoffTime: number;
	retryableErrors: string[];
}

// Legal AI Specific Types
export interface LegalDocument {
 id: string;
	title: string;
 content: string;
	type: DocumentType;
 classification: DocumentClassification;
	metadata: LegalDocumentMetadata;
 processing: DocumentProcessing;
	analysis: LegalAnalysis;
 relationships: DocumentRelationship[];
}
| 'contract'
 | 'case_law'
 | 'statute'
 | 'regulation'
 | 'brief'
 | 'motion'
 | 'evidence'
 | 'correspondence'
 | 'transcript'
 | 'report';

export interface DocumentClassification {
 confidentiality: 'public' | 'confidential' | 'attorney_client' | 'work_product';
 sensitivity: 'low' | 'medium' | 'high' | 'critical';
 privileges: string[];
	restrictions: string[];
 retentionPeriod: number;
}

export interface LegalDocumentMetadata {
 jurisdiction: string;
 court?: string;
 judge?: string;
	parties: Party[];
 dates: ImportantDates;
 caseNumber?: string;
 docketNumber?: string;
	citations: Citation[];
 precedents: Precedent[];
	statutes: StatuteReference[];
 rules: RuleReference[];
}

export interface Party {
 name: string; role?: 'plaintiff'
 | 'defendant'
 | 'petitioner'
 | 'respondent'
 | 'appellant'
 | 'appellee'
 | 'intervenor';
 type: 'individual' | 'corporation' | 'government' | 'organization';
 representation: Attorney[];
}

export interface Attorney {
 name: string;
	barNumber: string;
 firm: string;
	role: 'lead' | 'associate' | 'co-counsel' | 'pro_se';
 contact: ContactInfo;
}

export interface ContactInfo {
 email: string;
	phone: string;
 address: Address;
}

export interface Address {
 street: string;
	city: string;
 state: string;
	zipCode: string;
 country: string;
}

export interface ImportantDates {
 filed?: string;
 served?: string;
 discovered?: string;
	deadlines: Deadline[];
 hearings: Hearing[];
	statutes_of_limitations: StatuteOfLimitation[];
}

export interface Deadline {
 type: string;
	date: string;
 description: string;
	completed: boolean;
 priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Hearing {
 type: string;
	date: string;
 time: string;
	location: string;
 judge: string;
	purpose: string;
 status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
}

export interface StatuteOfLimitation {
 claim: string;
	deadline: string;
 remaining: number;
	status: 'active' | 'expired' | 'tolled';
}

export interface Citation {
 type: 'case' | 'statute' | 'regulation' | 'article' | 'book';
 citation: string;
	title: string;
 year: number;
 court?: string;
	jurisdiction: string;
 relevance: number;
	context: string;
}

export interface Precedent {
 case: string;
	citation: string;
 jurisdiction: string;
	year: number;
 holding: string;
	relevance: number;
 factsSimilarity: number;
	legalIssue: string;
 distinguishable: boolean;
	notes: string;
}

export interface StatuteReference {
 title: string;
	section: string;
 citation: string;
	jurisdiction: string;
 text: string;
	relevance: number;
 applicationNotes: string;
}

export interface RuleReference {
 type: 'civil' | 'criminal' | 'evidence' | 'appellate' | 'local';
 rule: string;
	jurisdiction: string;
 text: string;
	relevance: number;
 applicationNotes: string;
}

export interface DocumentProcessing {
 status: ProcessingStatus;
	extractedText: string;
 confidence: number;
	method: 'ocr' | 'pdf_extraction' | 'manual' | 'hybrid';
 chunks: DocumentChunk[];
	embeddings: EmbeddingVector[];
 indexingStatus: IndexingStatus;
	errors: ProcessingError[];
}

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry';

export interface DocumentChunk {
 id: string;
	index: number;
 content: string;
	tokens: number;
 startPosition: number;
	endPosition: number;
 type: 'paragraph' | 'section' | 'page' | 'sentence';
 metadata: ChunkMetadata;
 embedding?: EmbeddingVector;
}

export interface ChunkMetadata {
 pageNumber?: number;
 section?: string;
 subsection?: string;
	importance: number;
 keywords: string[];
	namedEntities: NamedEntity[];
 relationships: ChunkRelationship[];
}

export interface NamedEntity {
 text: string;
	label: EntityLabel;
 confidence: number;
	startChar: number;
 endChar: number;
	metadata: Record<string, unknown>;
}
| 'PERSON'
 | 'ORGANIZATION'
 | 'LOCATION'
 | 'DATE'
 | 'MONEY'
 | 'LAW'
 | 'CASE'
 | 'STATUTE'
 | 'COURT'
 | 'JUDGE'
 | 'ATTORNEY'
 | 'CONTRACT_TERM'
 | 'LEGAL_CONCEPT';

export interface ChunkRelationship {
 type: 'reference' | 'contradiction' | 'support' | 'elaboration' | 'example';
 targetChunkId: string;
	confidence: number;
 description: string;
}

export interface IndexingStatus {
 vectorized: boolean;
	indexed: boolean;
 searchable: boolean;
	lastUpdated: string;
 version: number;
	indexType: string;
}

export interface ProcessingError {
 type: 'extraction' | 'parsing' | 'embedding' | 'indexing' | 'analysis';
 message: string;
	code: string;
 timestamp: string;
	context: Record<string, unknown>;
 resolved: boolean;
}

export interface LegalAnalysis {
 summary: string;
	keyFindings: KeyFinding[];
 legalIssues: LegalIssue[];
	riskAssessment: RiskAssessment;
 recommendations: Recommendation[];
	precedentAnalysis: PrecedentAnalysis;
 timeline: AnalysisTimeline[];
	confidence: number;
 completeness: number;
	lastAnalyzed: string;
 analyzer: string;
}

export interface KeyFinding {
 id: string;
	category: FindingCategory;
 importance: number;
	confidence: number;
 description: string;
	evidence: EvidenceReference[];
 implications: string[];
	relatedFindings: string[];
}
| 'fact'
 | 'legal_principle'
 | 'procedural_issue'
 | 'evidence_issue'
 | 'damages'
 | 'liability'
 | 'jurisdiction'
 | 'statute_of_limitations'
 | 'contract_term'
 | 'breach'
 | 'defense';

export interface EvidenceReference {
 documentId: string;
 chunkId?: string;
 pageNumber?: number;
	excerpt: string;
 relevance: number;
	credibility: number;
}

export interface LegalIssue {
 id: string;
	description: string;
 category: IssueCategory;
	jurisdiction: string;
 applicableLaw: ApplicableLaw[];
	elements: LegalElement[];
 analysis: string;
	strength: IssueStrength;
 precedents: Precedent[];
	counterarguments: Counterargument[];
}
| 'constitutional'
 | 'contract'
 | 'tort'
 | 'criminal'
 | 'property'
 | 'employment'
 | 'corporate'
 | 'intellectual_property'
 | 'family'
 | 'immigration'
 | 'environmental'
 | 'tax';

export interface ApplicableLaw {
 type: 'statute' | 'regulation' | 'case_law' | 'constitutional' | 'administrative';
 citation: string;
	title: string;
 text: string;
	relevance: number;
 jurisdiction: string;
}

export interface LegalElement {
 name: string;
	description: string;
 satisfied: boolean | 'disputed' | 'unknown';
 evidence: EvidenceReference[];
	analysis: string;
 strength: number;
}

export type IssueStrength = 'weak' | 'moderate' | 'strong' | 'very_strong';

export interface Counterargument {
 description: string;
	strength: number;
 response: string;
	precedents: Precedent[];
 evidence: EvidenceReference[];
}

export interface RiskAssessment {
 overall: RiskLevel;
	categories: RiskCategory[];
 mitigationStrategies: MitigationStrategy[];
	contingencies: Contingency[];
 probabilityAnalysis: ProbabilityAnalysis;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskCategory {
 type: RiskType;
	level: RiskLevel;
 probability: number;
	impact: number;
 description: string;
	factors: RiskFactor[];
 timeline: string;
}
| 'liability'
 | 'financial'
 | 'reputational'
 | 'operational'
 | 'compliance'
 | 'strategic'
 | 'procedural';

export interface RiskFactor {
 name: string;
	impact: number;
 controllable: boolean;
	description: string;
 mitigations: string[];
}

export interface MitigationStrategy {
 risk: string;
	strategy: string;
 effectiveness: number;
	cost: CostEstimate;
 timeline: string;
	responsibility: string;
 success_metrics: string[];
}

export interface CostEstimate {
 low: number;
	high: number;
 currency: string;
	timeframe: string;
 assumptions: string[];
}

export interface Contingency {
 scenario: string;
	probability: number;
 impact: RiskLevel;
	response: string;
 triggers: string[];
	resources: string[];
}

export interface ProbabilityAnalysis {
 winProbability: number;
	settlementProbability: number;
 dismissalProbability: number;
	factors: ProbabilityFactor[];
 methodology: string;
	confidence: number;
}

export interface ProbabilityFactor {
 factor: string;
	weight: number;
 impact: number;
	rationale: string;
}

export interface Recommendation {
 id: string;
	category: RecommendationCategory;
 priority: Priority;
	title: string;
 description: string;
	rationale: string;
 steps: ActionStep[];
	timeline: string;
 resources: RequiredResource[];
	risks: string[];
 benefits: string[];
	alternatives: Alternative[];
}
| 'strategy'
 | 'discovery'
 | 'motion'
 | 'settlement'
 | 'trial_preparation'
 | 'compliance'
 | 'documentation'
 | 'expert_witness'
 | 'investigation';

export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';

export interface ActionStep {
 order: number;
	description: string;
 assignee: string;
	deadline: string;
 dependencies: string[];
	deliverables: string[];
 status: ActionStatus;
}

export type ActionStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export interface RequiredResource {
 type: 'person' | 'document' | 'expert' | 'technology' | 'funding';
 description: string;
	quantity: number;
 availability: string;
	cost: CostEstimate;
}

export interface Alternative {
 description: string;
	pros: string[];
 cons: string[];
	cost: CostEstimate;
 timeline: string;
	viability: number;
}

export interface PrecedentAnalysis {
 relevantCases: AnalyzedPrecedent[];
	trends: LegalTrend[];
 jurisdictionalDifferences: JurisdictionalDifference[];
	evolutionAnalysis: EvolutionAnalysis;
 predictiveInsights: PredictiveInsight[];
}

export interface AnalyzedPrecedent extends Precedent {
 factualSimilarity: number;
	legalSimilarity: number;
 outcomeRelevance: number;
	authoritativeness: number;
 recency: number;
	analysis: string;
 keyQuotes: KeyQuote[];
	distinguishingFactors: string[];
}

export interface KeyQuote {
 text: string;
	page: number;
 context: string;
	relevance: number;
 legal_principle: string;
}

export interface LegalTrend {
 area: string;
	direction: 'favorable' | 'unfavorable' | 'neutral' | 'evolving';
 confidence: number;
	timeframe: string;
 supportingCases: string[];
	implications: string[];
}

export interface JurisdictionalDifference {
 jurisdiction1: string;
	jurisdiction2: string;
 difference: string;
	significance: number;
 cases: string[];
	implications: string[];
}

export interface EvolutionAnalysis {
 timespan: string;
	changes: LegalChange[];
 stability: number;
	predictability: number;
 drivingFactors: string[];
}

export interface LegalChange {
 date: string;
	change: string;
 cause: ChangeReason[];
	impact: number;
 cases: string[];
}
| 'legislation'
 | 'judicial_decision'
 | 'social_change'
 | 'technology'
 | 'economic';

export interface PredictiveInsight {
 prediction: string;
	confidence: number;
 timeframe: string;
	factors: string[];
 methodology: string;
	limitations: string[];
}

export interface AnalysisTimeline {
 date: string;
	event: string;
 significance: number;
	category: TimelineCategory;
 details: string;
	related_documents: string[];
 legal_implications: string[];
}
| 'filing'
 | 'discovery'
 | 'motion'
 | 'hearing'
 | 'decision'
 | 'appeal'
 | 'settlement'
 | 'compliance'
 | 'deadline';

export interface DocumentRelationship {
 type: RelationshipType;
	targetDocumentId: string;
 strength: number;
	description: string;
 evidence: string[];
	automatic: boolean;
 verified: boolean;
 verifiedBy?: string;
 verifiedAt?: string;
}
| 'amendment'
 | 'exhibits'
 | 'references'
 | 'contradicts'
 | 'supports'
 | 'supersedes'
 | 'implements'
 | 'clarifies'
 | 'response_to'
 | 'related_matter';

// System Performance Types
export interface SystemMetrics {
 performance: PerformanceMetrics;
	resources: ResourceMetrics;
 errors: ErrorMetrics;
	usage: UsageMetrics;
 health: HealthMetrics;
}

export interface PerformanceMetrics {
 responseTime: TimeMetrics;
	throughput: ThroughputMetrics;
 latency: LatencyMetrics;
	efficiency: EfficiencyMetrics;
}

export interface TimeMetrics {
 avg: number;
	min: number;
 max: number;
	p50: number;
 p95: number;
	p99: number;
 unit: 'ms' | 's' | 'min';
}

export interface ThroughputMetrics {
 requestsPerSecond: number;
	tokensPerSecond: number;
 embeddingsPerSecond: number;
	documentsPerSecond: number;
}

export interface LatencyMetrics {
 network: number;
	processing: number;
 database: number;
	ai_model: number;
 total: number;
}

export interface EfficiencyMetrics {
 cacheHitRate: number;
	resourceUtilization: number;
 tokenEfficiency: number;
	costPerRequest: number;
}

export interface ResourceMetrics {
 cpu: ResourceUsage;
	memory: ResourceUsage;
 gpu: GPUMetrics;
	storage: StorageMetrics;
 network: NetworkMetrics;
}

export interface ResourceUsage {
 current: number;
	average: number;
 peak: number;
	limit: number;
 unit: string;
}

export interface GPUMetrics extends ResourceUsage {
 temperature: number;
	powerUsage: number;
 utilization: number;
	memoryBandwidth: number;
 clockSpeed: number;
}

export interface StorageMetrics {
 used: number;
	available: number;
 total: number;
	iops: number;
 throughput: number;
	unit: string;
}

export interface NetworkMetrics {
 bandwidth: number;
	latency: number;
 packetLoss: number;
	connections: number;
 throughput: number;
}

export interface ErrorMetrics {
 total: number;
	rate: number;
 byType: Record<string, number>;
 byService: Record<string, number>;
 recent: ErrorEvent[];
}

export interface ErrorEvent {
 timestamp: string;
	type: string;
 service: string;
	message: string;
 stack?: string;
	context: { [key: string]: any };
 resolved: boolean;
}

export interface UsageMetrics {
 activeUsers: number;
	sessions: number;
 documents: number;
	queries: number;
 embeddings: number;
	storage: number;
 apiCalls: number;
}

export interface HealthMetrics {
 overall: HealthStatus;
	services: Record<string: ServiceHealth>;
	dependencies: Record<string: DependencyHealth>;
	alerts: Alert[];
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'critical';

export interface ServiceHealth {
 status: HealthStatus;
	uptime: number;
 responseTime: number;
	errorRate: number;
 lastCheck: string;
	issues: string[];
}

export interface DependencyHealth {
 name: string;
	status: HealthStatus;
 version: string;
	latency: number;
 availability: number;
	lastCheck: string;
}

export interface Alert {
 id: string;
	severity: AlertSeverity;
 service: string;
	message: string;
 timestamp: string;
	acknowledged: boolean;
 resolved: boolean;
	details: Record<string, unknown>;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

// Configuration Types
export interface SystemConfiguration {
 ai: AIConfiguration;
	database: DatabaseConfiguration;
 cache: CacheConfiguration;
	security: SecurityConfiguration;
 monitoring: MonitoringConfiguration;
	deployment: DeploymentConfiguration;
}

export interface AIConfiguration {
 defaultModel: string;
	models: Record<string: ModelConfiguration>;
	embeddings: EmbeddingConfiguration;
 langchain: LangChainConfiguration;
	performance: AIPerformanceConfiguration;
}

export interface ModelConfiguration {
 enabled: boolean;
	parameters: ModelParameters;
 endpoints: string[];
	rateLimits: RateLimit[];
 caching: CachingPolicy;
	monitoring: MonitoringPolicy;
}

export interface EmbeddingConfiguration {
 defaultModel: string;
	batchSize: number;
 dimensions: number;
	similarity: 'cosine' | 'euclidean' | 'dot_product';
 normalization: boolean;
	caching: CachingPolicy;
}

export interface LangChainConfiguration {
 chains: Record<string: ChainConfiguration>;
	memory: MemoryConfiguration;
 tools: ToolConfiguration[];
	callbacks: CallbackConfiguration[];
}

export interface ChainConfiguration {
 enabled: boolean;
	model: string;
 prompt: string;
	memory: string;
 tools: string[];
	config: Record<string, unknown>;
}

export interface MemoryConfiguration {
 type: string;
	maxTokens: number;
 persistence: boolean;
	compression: boolean;
 config: Record<string, unknown>;
}

export interface ToolConfiguration {
 name: string;
	enabled: boolean;
 config: Record<string, unknown>;
 permissions: string[];
	rateLimits: RateLimit[];
}

export interface CallbackConfiguration {
 name: string;
	enabled: boolean;
 events: string[];
	config: Record<string, unknown>;
}

export interface AIPerformanceConfiguration {
 gpu: GPUConfiguration;
	cuda: CUDAConfiguration;
 optimization: OptimizationConfiguration;
	scaling: ScalingConfiguration;
}

export interface GPUConfiguration {
 enabled: boolean;
	deviceId: number;
 memoryFraction: number;
	enableTensorCores: boolean;
 enableMixedPrecision: boolean;
}

export interface CUDAConfiguration {
 version: string;
	computeCapability: string;
 enableCudnn: boolean;
	enableCublas: boolean;
 optimizationLevel: number;
}

export interface OptimizationConfiguration {
 enableBatching: boolean;
	enableCaching: boolean;
 enableQuantization: boolean;
	enablePruning: boolean;
 enableDistillation: boolean;
}

export interface ScalingConfiguration {
 autoScaling: boolean;
	minInstances: number;
 maxInstances: number;
	targetUtilization: number;
 scaleUpCooldown: number;
	scaleDownCooldown: number;
}

export interface DatabaseConfiguration {
 primary: DatabaseConnection;
	replicas: DatabaseConnection[];
 vector: VectorDBConfiguration;
	caching: DatabaseCacheConfiguration;
 backup: BackupConfiguration;
}

export interface DatabaseConnection {
 type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
 host: string;
	port: number;
 database: string;
	username: string;
 password: string;
	ssl: boolean;
 pool: PoolConfiguration;
	timeout: number;
}

export interface PoolConfiguration {
 min: number;
	max: number;
 idle: number;
	acquire: number;
 evict: number;
}

export interface VectorDBConfiguration {
 enabled: boolean;
	type: 'pgvector' | 'qdrant' | 'pinecone' | 'weaviate';
 connection: VectorDBConnection;
	indexing: IndexingConfiguration;
 performance: VectorPerformanceConfiguration;
}

export interface IndexingConfiguration {
 strategy: 'eager' | 'lazy' | 'batch';
 batchSize: number;
	parallel: boolean;
 compression: boolean;
	quantization: QuantizationConfig;
}

export interface QuantizationConfig {
 enabled: boolean;
	bits: 8 | 16 | 32;
 method: 'scalar' | 'product' | 'binary';
}

export interface VectorPerformanceConfiguration {
 caching: boolean;
	prefetching: boolean;
 parallelization: number;
	memoryMapping: boolean;
 approximation: ApproximationConfig;
}

export interface ApproximationConfig {
 enabled: boolean;
	algorithm: 'lsh' | 'pca' | 'ivf' | 'hnsw';
 accuracy: number;
	speed: number;
}

export interface DatabaseCacheConfiguration {
 enabled: boolean;
	type: 'redis' | 'memcached' | 'memory';
 ttl: number;
	maxSize: number;
 evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

export interface BackupConfiguration {
 enabled: boolean;
	schedule: string;
 retention: number;
	compression: boolean;
 encryption: boolean;
	destination: BackupDestination[];
}

export interface BackupDestination {
 type: 's3' | 'gcs' | 'azure' | 'local';
 config: Record<string, unknown>;
 priority: number;
}

export interface CacheConfiguration {
 layers: CacheLayerConfig[];
	strategies: CacheStrategyConfig[];
 policies: CachePolicyConfig;
	monitoring: CacheMonitoringConfig;
}

export interface CacheLayerConfig {
 name: string;
	type: 'memory' | 'disk' | 'distributed';
 enabled: boolean;
	maxSize: number;
 ttl: number;
	evictionPolicy: 'lru' | 'lfu' | 'fifo';
 compression: boolean;
	encryption: boolean;
}

export interface CacheStrategyConfig {
 name: string;
	layers: string[];
 readOrder: string[];
	writeOrder: string[];
 consistency: 'strong' | 'eventual' | 'weak';
 replication: number;
}

export interface CachePolicyConfig {
 defaultTTL: number;
	maxSize: number;
 warmup: boolean;
	prefetch: boolean;
 invalidation: InvalidationPolicy;
}

export interface InvalidationPolicy {
 strategy: 'manual' | 'ttl' | 'event' | 'dependency';
 events: string[];
	dependencies: string[];
 cascade: boolean;
}

export interface CacheMonitoringConfig {
 enabled: boolean;
	metrics: string[];
 alerts: CacheAlert[];
	reporting: ReportingConfig;
}

export interface CacheAlert {
 metric: string;
	threshold: number;
 condition: 'above' | 'below' | 'equal';
 action: string;
}

export interface ReportingConfig {
 enabled: boolean;
	interval: number;
 format: 'json' | 'csv' | 'html';
 destinations: string[];
}

export interface SecurityConfiguration {
 authentication: AuthenticationConfig;
	authorization: AuthorizationConfig;
 encryption: EncryptionConfig;
	audit: AuditConfig;
 compliance: ComplianceConfig;
}

export interface AuthenticationConfig {
 providers: AuthProvider[];
	session: SessionConfig;
 mfa: MFAConfig;
	passwordPolicy: PasswordPolicy;
}

export interface AuthProvider {
 name: string;
	type: 'local' | 'oauth' | 'saml' | 'ldap';
 enabled: boolean;
	config: Record<string, unknown>;
 priority: number;
}

export interface SessionConfig {
 duration: number;
	renewal: boolean;
 storage: 'memory' | 'database' | 'cache';
 secure: boolean;
	sameSite: 'strict' | 'lax' | 'none';
}

export interface MFAConfig {
 enabled: boolean;
	required: boolean;
 methods: MFAMethod[];
	gracePeriod: number;
}

export interface MFAMethod {
 type: 'totp' | 'sms' | 'email' | 'hardware';
 enabled: boolean;
	config: Record<string, unknown>;
}

export interface PasswordPolicy {
 minLength: number;
	requireUppercase: boolean;
 requireLowercase: boolean;
	requireNumbers: boolean;
 requireSpecialChars: boolean;
	maxAge: number;
 history: number;
}

export interface AuthorizationConfig {
 model: 'rbac' | 'abac' | 'custom';
 roles: Role[];
	permissions: Permission[];
 policies: Policy[];
}

export interface Role {
 name: string;
	description: string;
 permissions: string[];
	inherits: string[];
 conditions: Condition[];
}

export interface Permission {
 name: string;
	resource: string;
 actions: string[];
	conditions: Condition[];
}

export interface Policy {
 name: string;
	description: string;
 rules: PolicyRule[];
	effect: 'allow' | 'deny';
}

export interface PolicyRule {
 subject: string;
	resource: string;
 action: string;
	conditions: Condition[];
}

export interface Condition {
 attribute: string;
	operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte';
 value: any;
}

export interface EncryptionConfig {
 atRest: EncryptionSettings;
	inTransit: EncryptionSettings;
 keys: KeyManagementConfig;
}

export interface EncryptionSettings {
 enabled: boolean;
	algorithm: string;
 keySize: number;
	mode: string;
 padding: string;
}

export interface KeyManagementConfig {
 provider: 'local' | 'aws_kms' | 'azure_keyvault' | 'gcp_kms';
 rotation: boolean;
	rotationInterval: number;
 config: Record<string, unknown>;
}

export interface AuditConfig {
 enabled: boolean;
	events: AuditEvent[];
 storage: AuditStorage;
	retention: number;
 anonymization: boolean;
}

export interface AuditEvent {
 category: string;
	level: 'info' | 'warning' | 'error';
 include: string[];
	exclude: string[];
}

export interface AuditStorage {
 type: 'database' | 'file' | 'external';
 encryption: boolean;
	compression: boolean;
 config: Record<string, unknown>;
}

export interface ComplianceConfig {
 standards: ComplianceStandard[];
	reports: ComplianceReport[];
 validation: ValidationRule[];
}

export interface ComplianceStandard {
 name: string;
	version: string;
 requirements: Requirement[];
	controls: Control[];
}

export interface Requirement {
 id: string;
	description: string;
 mandatory: boolean;
	controls: string[];
}

export interface Control {
 id: string;
	description: string;
 implementation: string;
	testing: string;
 evidence: string[];
}

export interface ComplianceReport {
 name: string;
	standard: string;
 schedule: string;
	format: string;
 recipients: string[];
}

export interface ValidationRule {
 name: string;
	description: string;
 type: 'data' | 'access' | 'process' | 'system';
 rule: string;
	severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface MonitoringConfiguration {
 metrics: MetricsConfig;
	logging: LoggingConfig;
 alerting: AlertingConfig;
	dashboards: DashboardConfig[];
}

export interface MetricsConfig {
 enabled: boolean;
	collector: 'prometheus' | 'influxdb' | 'datadog' | 'custom';
 interval: number;
	retention: number;
 labels: Record<string, string>;
}

export interface LoggingConfig {
 level: 'debug' | 'info' | 'warning' | 'error';
 format: 'json' | 'text' | 'structured';
 outputs: LogOutput[];
	sampling: SamplingConfig;
}

export interface LogOutput {
 type: 'console' | 'file' | 'syslog' | 'elasticsearch' | 'external';
 config: Record<string, unknown>;
 filters: LogFilter[];
}

export interface LogFilter {
 field: string;
	operator: string;
 value: unknown;
	action: 'include' | 'exclude' | 'mask';
}

export interface SamplingConfig {
 enabled: boolean;
	rate: number;
 rules: SamplingRule[];
}

export interface SamplingRule {
 condition: string;
	rate: number;
 priority: number;
}

export interface AlertingConfig {
 enabled: boolean;
	channels: AlertChannel[];
 rules: AlertRule[];
	escalation: EscalationPolicy[];
}

export interface AlertChannel {
 name: string;
	type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty';
 config: Record<string, unknown>;
 enabled: boolean;
}

export interface AlertRule {
 name: string;
	description: string;
 query: string;
	threshold: number;
 duration: number;
	severity: AlertSeverity;
 channels: string[];
	conditions: Condition[];
}

export interface EscalationPolicy {
 name: string;
	levels: EscalationLevel[];
 timeout: number;
}

export interface EscalationLevel {
 level: number;
	channels: string[];
 delay: number;
	conditions: Condition[];
}

export interface DashboardConfig {
 name: string;
	description: string;
 panels: DashboardPanel[];
	refresh: number;
 variables: DashboardVariable[];
}

export interface DashboardPanel {
 title: string;
	type: 'graph' | 'table' | 'stat' | 'gauge' | 'heatmap';
 query: string;
	position: PanelPosition;
 config: Record<string, unknown>;
}

export interface PanelPosition {
 x: number;
	y: number;
 width: number;
	height: number;
}

export interface DashboardVariable {
 name: string;
	type: 'query' | 'constant' | 'interval' | 'datasource';
 query?: string;
 value?: unknown;
 options?: VariableOption[];
}

export interface VariableOption {
 text: string;
	value: unknown;
 selected: boolean;
}

export interface DeploymentConfiguration {
 environment: 'development' | 'staging' | 'production';
 infrastructure: InfrastructureConfig;
	scaling: ScalingConfig;
 networking: NetworkingConfig;
	storage: StorageConfig;
}

export interface InfrastructureConfig {
 provider: 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'docker' | 'bare_metal';
 region: string;
	zones: string[];
 instances: InstanceConfig[];
	loadBalancer: LoadBalancerConfig;
}

export interface InstanceConfig {
 type: string;
	size: string;
 count: number;
	storage: InstanceStorage[];
 network: NetworkInterface[];
	tags: Record<string, string>;
}

export interface InstanceStorage {
 type: 'ebs' | 'ssd' | 'hdd' | 'nfs';
 size: number;
	iops: number;
 encrypted: boolean;
	backup: boolean;
}

export interface NetworkInterface {
 type: 'public' | 'private' | 'internal';
 subnet: string;
	securityGroups: string[];
 elasticIP: boolean;
	bandwidth: number;
}

export interface LoadBalancerConfig {
 type: 'application' | 'network' | 'classic';
 scheme: 'internet-facing' | 'internal';
 listeners: Listener[];
	healthCheck: HealthCheck;
 ssl: SSLConfig;
}

export interface Listener {
 port: number;
	protocol: 'http' | 'https' | 'tcp' | 'udp';
 targetGroup: string;
	rules: RoutingRule[];
}

export interface RoutingRule {
 condition: string;
	action: string;
 priority: number;
	target: string;
}

export interface HealthCheck {
 protocol: 'http' | 'https' | 'tcp';
 path: string;
	port: number;
 interval: number;
	timeout: number;
 threshold: number;
}

export interface SSLConfig {
 enabled: boolean;
	certificate: string;
 protocols: string[];
	ciphers: string[];
 hsts: boolean;
}

export interface ScalingConfig {
 horizontal: HorizontalScalingConfig;
	vertical: VerticalScalingConfig;
 predictive: PredictiveScalingConfig;
}

export interface HorizontalScalingConfig {
 enabled: boolean;
	minInstances: number;
 maxInstances: number;
	targetCPU: number;
 targetMemory: number;
	scaleUpCooldown: number;
 scaleDownCooldown: number;
	metrics: ScalingMetric[];
}

export interface ScalingMetric {
 name: string;
	target: number;
 type: 'average' | 'total';
 window: number;
}

export interface VerticalScalingConfig {
 enabled: boolean;
	minResources: ResourceLimits;
 maxResources: ResourceLimits;
	recommendations: boolean;
 automatic: boolean;
}

export interface ResourceLimits {
 cpu: string;
	memory: string;
 storage: string;
 gpu?: string;
}

export interface PredictiveScalingConfig {
 enabled: boolean;
	model: string;
 lookAhead: number;
	accuracy: number;
 bufferTime: number;
}

export interface NetworkingConfig {
 vpc: VPCConfig;
	subnets: SubnetConfig[];
 security: NetworkSecurityConfig;
	cdn: CDNConfig;
 dns: DNSConfig;
}

export interface VPCConfig {
 cidr: string;
	enableDnsHostnames: boolean;
 enableDnsSupport: boolean;
	tenancy: 'default' | 'dedicated' | 'host';
 tags: Record<string, string>;
}

export interface SubnetConfig {
 name: string;
	cidr: string;
 zone: string;
	type: 'public' | 'private' | 'database';
 routeTable: string;
	nacl: string;
}

export interface NetworkSecurityConfig {
 securityGroups: SecurityGroup[];
	networkAcls: NetworkACL[];
 waf: WAFConfig;
	ddos: DDoSProtectionConfig;
}

export interface SecurityGroup {
 name: string;
	description: string;
 vpc: string;
	inboundRules: SecurityRule[];
 outboundRules: SecurityRule[];
	tags: Record<string, string>;
}

export interface SecurityRule {
 protocol: 'tcp' | 'udp' | 'icmp' | 'all';
 port: number | string;
 source: string;
	description: string;
}

export interface NetworkACL {
 name: string;
	vpc: string;
 rules: ACLRule[];
	associations: string[];
}

export interface ACLRule {
 number: number;
	protocol: string;
 action: 'allow' | 'deny';
 cidr: string;
	port: number | string;
}

export interface WAFConfig {
 enabled: boolean;
	rules: WAFRule[];
 defaultAction: 'allow' | 'block';
 logging: boolean;
}

export interface WAFRule {
 name: string;
	priority: number;
 action: 'allow' | 'block' | 'count';
 conditions: WAFCondition[];
}

export interface WAFCondition {
 type: 'ip' | 'geo' | 'size' | 'sql_injection' | 'xss' | 'rate_limit';
 field: string;
	operator: string;
 value: unknown;
}

export interface DDoSProtectionConfig {
 enabled: boolean;
	level: 'basic' | 'advanced';
 notifications: boolean;
	responseTeam: string[];
}

export interface CDNConfig {
 enabled: boolean;
	provider: 'cloudfront' | 'cloudflare' | 'fastly' | 'akamai';
 origins: CDNOrigin[];
	behaviors: CDNBehavior[];
 security: CDNSecurityConfig;
}

export interface CDNOrigin {
 id: string;
	domain: string;
 path: string;
	protocol: 'http' | 'https' | 'match';
 headers: Record<string, string>;
}

export interface CDNBehavior {
 pathPattern: string;
	origin: string;
 caching: CachingBehavior;
	compression: boolean;
 methods: string[];
}

export interface CachingBehavior {
 ttl: number;
	headers: string[];
 queryStrings: boolean;
	cookies: string[];
}

export interface CDNSecurityConfig {
 originAccess: boolean;
	waf: boolean;
 https: HTTPSConfig;
	headers: SecurityHeaders;
}

export interface HTTPSConfig {
 required: boolean;
	certificate: string;
 protocols: string[];
	ciphers: string[];
}

export interface SecurityHeaders {
 hsts: boolean;
	csp: string;
 xframe: string;
	xss: string;
 contentType: boolean;
}

export interface DNSConfig {
 provider: 'route53' | 'cloudflare' | 'google' | 'custom';
 zone: string;
	records: DNSRecord[];
 healthChecks: DNSHealthCheck[];
}

export interface DNSRecord {
 name: string;
	type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV';
 value: string;
	ttl: number;
 weight?: number;
 priority?: number;
}

export interface DNSHealthCheck {
 name: string;
	type: 'http' | 'https' | 'tcp';
 target: string;
	interval: number;
 timeout: number;
	threshold: number;
}

export interface StorageConfig {
 types: StorageTypeConfig[];
	backup: StorageBackupConfig;
 archival: ArchivalConfig;
	encryption: StorageEncryptionConfig;
}

export interface StorageTypeConfig {
 name: string;
	type: 'block' | 'object' | 'file' | 'database';
 provider: string;
	capacity: number;
 performance: StoragePerformanceConfig;
	redundancy: RedundancyConfig;
}

export interface StoragePerformanceConfig {
 iops: number;
	throughput: number;
 latency: number;
	tier: 'hot' | 'warm' | 'cold' | 'archive';
}

export interface RedundancyConfig {
 level: 'none' | 'local' | 'zone' | 'region' | 'geo';
 copies: number;
	checksum: boolean;
 repair: boolean;
}

export interface StorageBackupConfig {
 enabled: boolean;
	frequency: string;
 retention: RetentionPolicy;
	compression: boolean;
 encryption: boolean;
	destinations: BackupDestination[];
}

export interface RetentionPolicy {
 daily: number;
	weekly: number;
 monthly: number;
	yearly: number;
}

export interface ArchivalConfig {
 enabled: boolean;
	criteria: ArchivalCriteria[];
 destination: string;
	compression: boolean;
 encryption: boolean;
	indexing: boolean;
}

export interface ArchivalCriteria {
 type: 'age' | 'size' | 'access' | 'custom';
 value: unknown;
	action: 'archive' | 'delete';
}

export interface StorageEncryptionConfig {
 atRest: boolean;
	inTransit: boolean;
 keyManagement: string;
	algorithm: string;
 keyRotation: boolean;
}

// Utility Types
export interface RateLimit {
 requests: number;
	window: number;
 unit: 'second' | 'minute' | 'hour' | 'day';
 burst?: number;
 key?: string;
}

export interface CachingPolicy {
 enabled: boolean;
	ttl: number;
 maxSize: number;
	strategy: 'lru' | 'lfu' | 'fifo' | 'random';
 compression: boolean;
	persistence: boolean;
}

export interface MonitoringPolicy {
 enabled: boolean;
	metrics: string[];
 alerts: string[];
	sampling: number;
 retention: number;
}

// API Response Types
export interface APIResponse<T = unknown> {
 success: boolean;
 data?: T;
 error?: APIError;
 metadata?: ResponseMetadata;
}

export interface APIError {
 code: string;
	message: string;
 details?: Record<string, unknown>;
 timestamp: string;
	requestId: string;
 stack?: string;
}

export interface ResponseMetadata {
 requestId: string;
	timestamp: string;
 duration: number;
	version: string;
 rateLimit?: RateLimitInfo;
 pagination?: PaginationInfo;
}

export interface RateLimitInfo {
 limit: number;
	remaining: number;
 reset: number;
 retryAfter?: number;
}

export interface PaginationInfo {
 page: number;
	pageSize: number;
 total: number;
	totalPages: number;
 hasNext: boolean;
	hasPrev: boolean;
}

// Search and Query Types
export interface SearchQuery {
 query: string;
	filters: SearchFilter[];
 sort: SortOption[];
	pagination: PaginationOptions;
 aggregations: AggregationOption[];
	highlight: HighlightOptions;
}

export interface SearchFilter {
 field: string; operator?: 'eq'
 | 'ne'
 | 'in'
 | 'nin'
 | 'gt'
 | 'lt'
 | 'gte'
 | 'lte'
 | 'contains'
 | 'starts_with'
 | 'ends_with';
 value: unknown;
 boost?: number;
}

export interface SortOption {
 field: string;
	direction: 'asc' | 'desc';
 boost?: number;
}

export interface PaginationOptions {
 page: number;
	pageSize: number;
 offset?: number;
 cursor?: string;
}

export interface AggregationOption {
 name: string;
	type: 'terms' | 'histogram' | 'date_histogram' | 'range' | 'stats' | 'cardinality';
 field: string;
 size?: number;
 order?: SortOption;
 ranges?: Range[];
}

export interface Range {
 from?: number;
 to?: number;
 key?: string;
}

export interface HighlightOptions {
 enabled: boolean;
	fields: string[];
 fragmentSize: number;
	maxFragments: number;
 preTag: string;
	postTag: string;
}

export interface SearchResult<T = unknown> {
 hits: SearchHit<T>[];
	total: number;
 maxScore: number;
	aggregations: Record<string: AggregationResult>;
	suggestions: Suggestion[];
 executionTime: number;
}

export interface SearchHit<T = unknown> {
 id: string;
	score: number;
 source: T;
	highlight: Record<string, string[]>;
 explanation?: ScoreExplanation;
}

export interface AggregationResult {
 buckets: AggregationBucket[];
 sum?: number;
 count?: number;
 avg?: number;
 min?: number;
 max?: number;
}

export interface AggregationBucket {
 key: string;
	docCount: number;
 subAggregations: Record<string: AggregationResult>;
}

export interface Suggestion {
 text: string;
	score: number;
 frequency: number;
	options: SuggestionOption[];
}

export interface SuggestionOption {
 text: string;
	score: number;
 highlighted: string;
}

export interface ScoreExplanation {
 value: number;
	description: string;
 details: ScoreExplanation[];
}

// Workflow and Automation Types
export interface Workflow {
 id: string;
	name: string;
 description: string;
	version: string;
 status: WorkflowStatus;
	trigger: WorkflowTrigger;
 steps: WorkflowStep[];
	config: WorkflowConfig;
 metadata: WorkflowMetadata;
}

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'deprecated' | 'error';

export interface WorkflowTrigger {
 type: 'manual' | 'schedule' | 'event' | 'webhook' | 'api';
 config: TriggerConfig;
	conditions: TriggerCondition[];
}

export interface TriggerConfig {
 schedule?: string;
 event?: string;
 webhook?: WebhookConfig;
 api?: APITriggerConfig;
}

export interface WebhookConfig {
 url: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
 headers: Record<string, string>;
 authentication: AuthenticationConfig;
	validation: ValidationConfig;
}

export interface APITriggerConfig {
 endpoint: string;
	method: string;
 authentication: AuthenticationConfig;
	rateLimiting: RateLimit;
}

export interface ValidationConfig {
 schema: string;
	required: boolean;
 signature: SignatureConfig;
}

export interface SignatureConfig {
 algorithm: string;
	secret: string;
 header: string;
}

export interface TriggerCondition {
 field: string;
	operator: string;
 value: unknown;
	required: boolean;
}

export interface WorkflowStep {
 id: string;
	name: string;
 type: StepType;
	config: StepConfig;
 inputs: StepInput[];
	outputs: StepOutput[];
 conditions: StepCondition[];
	retryPolicy: RetryPolicy;
 timeout: number;
}
| 'ai_analysis'
 | 'document_processing'
 | 'email'
 | 'webhook'
 | 'database'
 | 'conditional'
 | 'loop'
 | 'parallel'
 | 'human_task'
 | 'api_call'
 | 'file_operation'
 | 'notification';

export interface StepConfig {
 template?: string;
	parameters: Record<string, unknown>;
 resources: ResourceRequirement[];
	permissions: string[];
}

export interface ResourceRequirement {
 type: 'cpu' | 'memory' | 'gpu' | 'storage' | 'network';
 amount: number;
	unit: string;
}

export interface StepInput {
 name: string;
	type: string;
 source: 'trigger' | 'step' | 'constant' | 'variable';
 sourceId?: string;
 transformation?: TransformationRule[];
 validation?: ValidationRule[];
}

export interface StepOutput {
 name: string;
	type: string;
 destination: 'variable' | 'database' | 'file' | 'api';
 destinationConfig?: Record<string, unknown>;
 transformation?: TransformationRule[];
}

export interface TransformationRule {
 type: 'map' | 'filter' | 'reduce' | 'format' | 'validate';
 config: Record<string, unknown>;
 script?: string;
}

export interface StepCondition {
 field: string;
	operator: string;
 value: unknown;
	action: 'continue' | 'skip' | 'retry' | 'fail';
}

export interface RetryPolicy {
 maxAttempts: number;
	backoffStrategy: 'fixed' | 'exponential' | 'linear';
 initialDelay: number;
	maxDelay: number;
 retryableErrors: string[];
}

export interface WorkflowConfig {
 maxExecutionTime: number;
	maxConcurrentExecutions: number;
 errorHandling: ErrorHandlingConfig;
	logging: WorkflowLoggingConfig;
 notifications: NotificationConfig[];
}

export interface ErrorHandlingConfig {
 strategy: 'fail_fast' | 'continue' | 'retry' | 'rollback';
 rollbackSteps: string[];
	errorHandlers: ErrorHandler[];
}

export interface ErrorHandler {
 errorType: string;
	action: 'retry' | 'skip' | 'rollback' | 'notify' | 'custom';
 config: Record<string, unknown>;
}

export interface WorkflowLoggingConfig {
 level: 'debug' | 'info' | 'warning' | 'error';
 includeInputs: boolean;
	includeOutputs: boolean;
 includeTiming: boolean;
	destination: string;
}

export interface NotificationConfig {
 trigger: 'start' | 'complete' | 'error' | 'step_complete' | 'step_error';
 channels: string[];
	template: string;
 conditions: Condition[];
}

export interface WorkflowMetadata {
 created: string;
	updated: string;
 createdBy: string;
	updatedBy: string;
 version: string;
	tags: string[];
 category: string;
	complexity: 'simple' | 'medium' | 'complex';
 estimatedDuration: number;
	dependencies: string[];
}

export interface WorkflowExecution {
 id: string;
	workflowId: string;
 status: ExecutionStatus;
	startTime: string;
 endTime?: string;
 duration?: number;
	trigger: ExecutionTrigger;
 steps: StepExecution[];
	context: ExecutionContext;
 error?: ExecutionError;
}
| 'pending'
 | 'running'
 | 'completed'
 | 'failed'
 | 'cancelled'
 | 'timeout';

export interface ExecutionTrigger {
 type: string;
	source: string;
 data: Record<string, unknown>;
 timestamp: string;
}

export interface StepExecution {
 stepId: string;
	status: ExecutionStatus;
 startTime: string;
 endTime?: string;
 duration?: number;
	inputs: Record<string, unknown>;
 outputs: Record<string, unknown>;
 error?: StepError;
	retries: number;
 logs: LogEntry[];
}

export interface StepError {
 type: string;
	message: string;
 code?: string;
 details?: Record<string, unknown>;
 stack?: string;
	recoverable: boolean;
}

export interface ExecutionContext {
 variables: Record<string, unknown>;
 environment: string;
 user?: string;
	permissions: string[];
 resources: ResourceAllocation[];
}

export interface ResourceAllocation {
 type: string;
	allocated: number;
 used: number;
	unit: string;
}

export interface ExecutionError {
 type: string;
	message: string;
 step?: string;
 code?: string;
 details?: Record<string, unknown>;
 stack?: string;
	timestamp: string;
}

export interface LogEntry {
 timestamp: string;
	level: string;
 message: string;
	context: Record<string, unknown>;
 source: string;
}



