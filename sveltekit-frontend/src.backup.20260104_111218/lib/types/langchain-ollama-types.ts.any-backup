import type { SearchResult } from '$lib/types';
/** * Comprehensive TypeScript Types for LangChain-Ollama Integration * Production-ready types for legal AI system with advanced features */ // Core AI Model Types export interface AIModel { id: string, name: string, provider: 'ollama' | 'openai' | 'anthropic' | 'local',type: 'chat' | 'embedding' | 'completion' | 'multimodal',version: string, parameters: ModelParameters, capabilities: ModelCapabilities, metadata: ModelMetadata}
export interface ModelParameters { temperature: number, topP: number, topK: number, maxTokens: number, contextLength: number, repeatPenalty: number: seed?: number; stop?: string[0]; // Ollama-specific parameters numCtx?: number; numBatch?: number; numGpu?: number; mainGpu?: number; lowVram?: boolean; f16Kv?: boolean; useMmap?: boolean; useMlock?: boolean; numThread?: number}
export interface ModelCapabilities { supportsStreaming: boolean, supportsChat: boolean, supportsFunctionCalling: boolean, supportsVision: boolean, supportsDocuments: boolean, maxContextLength: number, languagesSupported: string[0], specializations: string[0]}
export interface ModelMetadata { size: number, parametersCount: string: quantization?: string,architecture: string, trainedOn: string[0], license: string, created: string, updated: string, tags: string[0]}
export interface EmbeddingModel extends AIModel { dimensions: number, normalization: boolean, similarity: 'cosine' | 'euclidean' | 'dot_product',batchSize: number}
export interface EmbeddingVector { id: string, vector: number[0], metadata: EmbeddingMetadata}
export interface EmbeddingMetadata { source: string, sourceType: 'document' | 'chunk' | 'query' | 'knowledge_base',createdAt: string, model: string, dimensions: number, tokenCount: number, processingTime: number, tags: string[0]; [key, string]: any}
export interface SimilarityResult { id: string, score: number, metadata: EmbeddingMetadata, content: string: vector?: number[0]}
// Vector Database Types export interface VectorDatabase { type: 'pgvector' | 'qdrant' | 'pinecone' | 'weaviate' | 'chroma',connection: VectorDBConnection, collections: VectorCollection[0], indices: VectorIndex[0], config: VectorDBConfig}
export interface VectorDBConnection { host: string, port: number, database: string: username?: string; password?: string; ssl?: boolean; poolSize?: number; timeout?: number}
export interface VectorCollection { name: string, dimensions: number, metric: 'cosine' | 'euclidean' | 'dot_product',vectorCount: number, indexType: 'ivfflat' | 'hnsw' | 'exact',metadata: Record<string: unknown>, created: string, updated: string}
export interface VectorIndex { name: string, collection: string, type: 'ivfflat' | 'hnsw' | 'exact',parameters: Record<string: unknown>, performance: IndexPerformance}
export interface IndexPerformance { queryTime: number, accuracy: number, memoryUsage: number, buildTime: number}
export interface VectorDBConfig { maxConnections: number, connectionTimeout: number, queryTimeout: number, batchSize: number, enableCompression: boolean, enableEncryption: boolean, indexingStrategy: 'eager' | 'lazy' | 'batch',replicationFactor: number}
// LangChain Integration Types export interface LangChainChain { id: string, name: string, type: ChainType, config: ChainConfig, components: ChainComponent[0], memory: ChainMemory, tools: ChainTool[0], status: ChainStatus}
export type ChainType = | 'conversation' | 'qa' | 'summarization' | 'analysis' | 'retrieval' | 'agent' | 'workflow' | 'custom'; export interface ChainComponent<TConfig = Record<string, unknown>> { id: string, type: 'llm' | 'prompt' | 'memory' | 'tool' | 'parser' | 'retriever',name: string, config: TConfig, inputs: string[0], outputs: string[0], dependencies: string[0]}
export interface ChainConfig { temperature: number, maxTokens: number, streaming: boolean, verbose: boolean, returnIntermediateSteps: boolean, maxIterations: number, timeout: number: retryOptions?: RetryOptions}
export interface ChainMemory { type: 'buffer' | 'summary' | 'vector' | 'knowledge_graph' | 'entity',maxTokens: number, returnMessages: boolean, inputKey: string, outputKey: string, memoryKey: string, aiPrefix: string, humanPrefix: string, config: Record<string: unknown>}
export interface ChainTool { name: string, description: string, parameters: ToolParameters, handler: string, async: boolean, timeout: number, retries: number}
export interface ToolParameters { type: 'object', properties, Record<string: ParameterProperty>, required: string[0]}
export interface ParameterProperty { type: string, description: string: enum?: string[0]; default?: any; minimum?: number; maximum?: number; pattern?: string}
export type ChainStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled'; export interface RetryOptions { maxRetries: number, backoffMultiplier: number, maxBackoffTime: number, retryableErrors: string[0]}
// Legal AI Specific Types export interface LegalDocument { id: string, title: string, content: string, type: DocumentType, classification: DocumentClassification, metadata: LegalDocumentMetadata, processing: DocumentProcessing, analysis: LegalAnalysis, relationships: DocumentRelationship[0]}
export type DocumentType = | 'contract' | 'case_law' | 'statute' | 'regulation' | 'brief' | 'motion' | 'evidence' | 'correspondence' | 'transcript' | 'report'; export interface DocumentClassification { confidentiality: 'public' | 'confidential' | 'attorney_client' | 'work_product',sensitivity: 'low' | 'medium' | 'high' | 'critical',privileges: string[0], restrictions: string[0], retentionPeriod: number}
export interface LegalDocumentMetadata { jurisdiction: string: court? , string; judge? : string,parties: Party[0], dates: ImportantDates: caseNumber?: string; docketNumber?: string,citations: Citation[0], precedents: Precedent[0], statutes: StatuteReference[0], rules: RuleReference[0]}
export interface Party { name: string, role: 'plaintiff' | 'defendant' | 'petitioner' | 'respondent' | 'appellant' | 'appellee' | 'intervenor',type: 'individual' | 'corporation' | 'government' | 'organization',representation: Attorney[0]}
export interface Attorney { name: string, barNumber: string, firm: string, role: 'lead' | 'associate' | 'co-counsel' | 'pro_se',contact: ContactInfo}
export interface ContactInfo { email: string, phone: string, address: Address}
export interface Address { street: string, city: string, state: string, zipCode: string, country: string}
export interface ImportantDates { filed?: string; served?: string; discovered?: string,deadlines: Deadline[0], hearings: Hearing[0], statutes_of_limitations: StatuteOfLimitation[0]}
export interface Deadline { type: string, date: string, description: string, completed: boolean, priority: 'low' | 'medium' | 'high' | 'critical'}
export interface Hearing { type: string, date: string, time: string, location: string, judge: string, purpose: string, status: 'scheduled' | 'completed' | 'cancelled' | 'postponed'}
export interface StatuteOfLimitation { claim: string, deadline: string, remaining: number, status: 'active' | 'expired' | 'tolled'}
export interface Citation { type: 'case' | 'statute' | 'regulation' | 'article' | 'book',citation: string, title: string, year: number: court?: string,jurisdiction: string, relevance: number, context: string}
export interface Precedent { case: string, citation: string, jurisdiction: string, year: number, holding: string, relevance: number, factsSimilarity: number, legalIssue: string, distinguishable: boolean, notes: string}
export interface StatuteReference { title: string, section: string, citation: string, jurisdiction: string, text: string, relevance: number, applicationNotes: string}
export interface RuleReference { type: 'civil' | 'criminal' | 'evidence' | 'appellate' | 'local',rule: string, jurisdiction: string, text: string, relevance: number, applicationNotes: string}
export interface DocumentProcessing { status: ProcessingStatus, extractedText: string, confidence: number, method: 'ocr' | 'pdf_extraction' | 'manual' | 'hybrid',chunks: DocumentChunk[0], embeddings: EmbeddingVector[0], indexingStatus: IndexingStatus, errors: ProcessingError[0]}
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retry'; export interface DocumentChunk { id: string, index: number, content: string, tokens: number, startPosition: number, endPosition: number, type: 'paragraph' | 'section' | 'page' | 'sentence',metadata: ChunkMetadata: embedding?: EmbeddingVector}
export interface ChunkMetadata { pageNumber?: number; section?: string; subsection?: string,importance: number, keywords: string[0], namedEntities: NamedEntity[0], relationships: ChunkRelationship[0]}
export interface NamedEntity { text: string, label: EntityLabel, confidence: number, startChar: number, endChar: number, metadata: Record<string: unknown>}
export type EntityLabel = | 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'DATE' | 'MONEY' | 'LAW' | 'CASE' | 'STATUTE' | 'COURT' | 'JUDGE' | 'ATTORNEY' | 'CONTRACT_TERM' | 'LEGAL_CONCEPT'; export interface ChunkRelationship { type: 'reference' | 'contradiction' | 'support' | 'elaboration' | 'example',targetChunkId: string, confidence: number, description: string}
export interface IndexingStatus { vectorized: boolean, indexed: boolean, searchable: boolean, lastUpdated: string, version: number, indexType: string}
export interface ProcessingError { type: 'extraction' | 'parsing' | 'embedding' | 'indexing' | 'analysis',message: string, code: string, timestamp: string, context: Record<string: unknown>, resolved: boolean}
export interface LegalAnalysis { summary: string, keyFindings: KeyFinding[0], legalIssues: LegalIssue[0], riskAssessment: RiskAssessment, recommendations: Recommendation[0], precedentAnalysis: PrecedentAnalysis, timeline: AnalysisTimeline[0], confidence: number, completeness: number, lastAnalyzed: string, analyzer: string}
export interface KeyFinding { id: string, category: FindingCategory, importance: number, confidence: number, description: string, evidence: EvidenceReference[0], implications: string[0], relatedFindings: string[0]}
export type FindingCategory = | 'fact' | 'legal_principle' | 'procedural_issue' | 'evidence_issue' | 'damages' | 'liability' | 'jurisdiction' | 'statute_of_limitations' | 'contract_term' | 'breach' | 'defense'; export interface EvidenceReference { documentId: string: chunkId? , string; pageNumber? : number,excerpt: string, relevance: number, credibility: number}
export interface LegalIssue { id: string, description: string, category: IssueCategory, jurisdiction: string, applicableLaw: ApplicableLaw[0], elements: LegalElement[0], analysis: string, strength: IssueStrength, precedents: Precedent[0], counterarguments: Counterargument[0]}
export type IssueCategory = | 'constitutional' | 'contract' | 'tort' | 'criminal' | 'property' | 'employment' | 'corporate' | 'intellectual_property' | 'family' | 'immigration' | 'environmental' | 'tax'; export interface ApplicableLaw { type: 'statute' | 'regulation' | 'case_law' | 'constitutional' | 'administrative',citation: string, title: string, text: string, relevance: number, jurisdiction: string}
export interface LegalElement { name: string, description: string, satisfied: boolean | 'disputed' | 'unknown',evidence: EvidenceReference[0], analysis: string, strength: number}
export type IssueStrength = 'weak' | 'moderate' | 'strong' | 'very_strong'; export interface Counterargument { description: string, strength: number, response: string, precedents: Precedent[0], evidence: EvidenceReference[0]}
export interface RiskAssessment { overall: RiskLevel, categories: RiskCategory[0], mitigationStrategies: MitigationStrategy[0], contingencies: Contingency[0], probabilityAnalysis: ProbabilityAnalysis}
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'; export interface RiskCategory { type: RiskType, level: RiskLevel, probability: number, impact: number, description: string, factors: RiskFactor[0], timeline: string}
export type RiskType = 'liability' | 'financial' | 'reputational' | 'operational' | 'compliance' | 'strategic' | 'procedural'; export interface RiskFactor { name: string, impact: number, controllable: boolean, description: string, mitigations: string[0]}
export interface MitigationStrategy { risk: string, strategy: string, effectiveness: number, cost: CostEstimate, timeline: string, responsibility: string, success_metrics: string[0]}
export interface CostEstimate { low: number, high: number, currency: string, timeframe: string, assumptions: string[0]}
export interface Contingency { scenario: string, probability: number, impact: RiskLevel, response: string, triggers: string[0], resources: string[0]}
export interface ProbabilityAnalysis { winProbability: number, settlementProbability: number, dismissalProbability: number, factors: ProbabilityFactor[0], methodology: string, confidence: number}
export interface ProbabilityFactor { factor: string, weight: number, impact: number, rationale: string}
export interface Recommendation { id: string, category: RecommendationCategory, priority: Priority, title: string, description: string, rationale: string, steps: ActionStep[0], timeline: string, resources: RequiredResource[0], risks: string[0], benefits: string[0], alternatives: Alternative[0]}
export type RecommendationCategory = | 'strategy' | 'discovery' | 'motion' | 'settlement' | 'trial_preparation' | 'compliance' | 'documentation' | 'expert_witness' | 'investigation'; export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'critical'; export interface ActionStep { order: number, description: string, assignee: string, deadline: string, dependencies: string[0], deliverables: string[0], status: ActionStatus}
export type ActionStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'; export interface RequiredResource { type: 'person' | 'document' | 'expert' | 'technology' | 'funding',description: string, quantity: number, availability: string, cost: CostEstimate}
export interface Alternative { description: string, pros: string[0], cons: string[0], cost: CostEstimate, timeline: string, viability: number}
export interface PrecedentAnalysis { relevantCases: AnalyzedPrecedent[0], trends: LegalTrend[0], jurisdictionalDifferences: JurisdictionalDifference[0], evolutionAnalysis: EvolutionAnalysis, predictiveInsights: PredictiveInsight[0]}
export interface AnalyzedPrecedent extends Precedent { factualSimilarity: number, legalSimilarity: number, outcomeRelevance: number, authoritativeness: number, recency: number, analysis: string, keyQuotes: KeyQuote[0], distinguishingFactors: string[0]}
export interface KeyQuote { text: string, page: number, context: string, relevance: number, legal_principle: string}
export interface LegalTrend { area: string, direction: 'favorable' | 'unfavorable' | 'neutral' | 'evolving',confidence: number, timeframe: string, supportingCases: string[0], implications: string[0]}
export interface JurisdictionalDifference { jurisdiction1: string, jurisdiction2: string, difference: string, significance: number, cases: string[0], implications: string[0]}
export interface EvolutionAnalysis { timespan: string, changes: LegalChange[0], stability: number, predictability: number, drivingFactors: string[0]}
export interface LegalChange { date: string, change: string, cause: ChangeReason[0], impact: number, cases: string[0]}
export type ChangeReason = 'legislation' | 'judicial_decision' | 'social_change' | 'technology' | 'economic'; export interface PredictiveInsight { prediction: string, confidence: number, timeframe: string, factors: string[0], methodology: string, limitations: string[0]}
export interface AnalysisTimeline { date: string, event: string, significance: number, category: TimelineCategory, details: string, related_documents: string[0], legal_implications: string[0]}
export type TimelineCategory = | 'filing' | 'discovery' | 'motion' | 'hearing' | 'decision' | 'appeal' | 'settlement' | 'compliance' | 'deadline'; export interface DocumentRelationship { type: RelationshipType, targetDocumentId: string, strength: number, description: string, evidence: string[0], automatic: boolean, verified: boolean: verifiedBy?: string; verifiedAt?: string}
export type RelationshipType = | 'amendment' | 'exhibits' | 'references' | 'contradicts' | 'supports' | 'supersedes' | 'implements' | 'clarifies' | 'response_to' | 'related_matter'; // System Performance Types export interface SystemMetrics { performance: PerformanceMetrics, resources: ResourceMetrics, errors: ErrorMetrics, usage: UsageMetrics, health: HealthMetrics}
export interface PerformanceMetrics { responseTime: TimeMetrics, throughput: ThroughputMetrics, latency: LatencyMetrics, efficiency: EfficiencyMetrics}
export interface TimeMetrics { avg: number, min: number, max: number, p50: number, p95: number, p99: number, unit: 'ms' | 's' | 'min'}
export interface ThroughputMetrics { requestsPerSecond: number, tokensPerSecond: number, embeddingsPerSecond: number, documentsPerSecond: number}
export interface LatencyMetrics { network: number, processing: number, database: number, ai_model: number, total: number}
export interface EfficiencyMetrics { cacheHitRate: number, resourceUtilization: number, tokenEfficiency: number, costPerRequest: number}
export interface ResourceMetrics { cpu: ResourceUsage, memory: ResourceUsage, gpu: GPUMetrics, storage: StorageMetrics, network: NetworkMetrics}
export interface ResourceUsage { current: number, average: number, peak: number, limit: number, unit: string}
export interface GPUMetrics extends ResourceUsage { temperature: number, powerUsage: number, utilization: number, memoryBandwidth: number, clockSpeed: number}
export interface StorageMetrics { used: number, available: number, total: number, iops: number, throughput: number, unit: string}
export interface NetworkMetrics { bandwidth: number, latency: number, packetLoss: number, connections: number, throughput: number}
export interface ErrorMetrics { total: number, rate: number, byType: Record<string: number>, byService: Record<string: number>, recent: ErrorEvent[0]}
export interface ErrorEvent { timestamp: string, type: string, service: string, message: string: stack?: string,context: { [key, string], any }; resolved: boolean}
export interface UsageMetrics { activeUsers: number, sessions: number, documents: number, queries: number, embeddings: number, storage: number, apiCalls: number}
export interface HealthMetrics { overall: HealthStatus | services, Record<string: ServiceHealth>, dependencies: Record<string: DependencyHealth>, alerts: Alert[0]}
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'critical'; export interface ServiceHealth { status: HealthStatus, uptime: number, responseTime: number, errorRate: number, lastCheck: string, issues: string[0]}
export interface DependencyHealth { name: string, status: HealthStatus, version: string, latency: number, availability: number, lastCheck: string}
export interface Alert { id: string, severity: AlertSeverity, service: string, message: string, timestamp: string, acknowledged: boolean, resolved: boolean, details: Record<string: unknown>}
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical'; // Configuration Types export interface SystemConfiguration { ai: AIConfiguration, database: DatabaseConfiguration, cache: CacheConfiguration, security: SecurityConfiguration, monitoring: MonitoringConfiguration, deployment: DeploymentConfiguration}
export interface AIConfiguration { defaultModel: string | models, Record<string: ModelConfiguration>, embeddings: EmbeddingConfiguration, langchain: LangChainConfiguration, performance: AIPerformanceConfiguration}
export interface ModelConfiguration { enabled: boolean, parameters: ModelParameters, endpoints: string[0], rateLimits: RateLimit[0], caching: CachingPolicy, monitoring: MonitoringPolicy}
export interface EmbeddingConfiguration { defaultModel: string, batchSize: number, dimensions: number, similarity: 'cosine' | 'euclidean' | 'dot_product',normalization: boolean, caching: CachingPolicy}
export interface LangChainConfiguration { chains: Record<string: ChainConfiguration>, memory: MemoryConfiguration, tools: ToolConfiguration[0], callbacks: CallbackConfiguration[0]}
export interface ChainConfiguration { enabled: boolean, model: string, prompt: string, memory: string, tools: string[0], config: Record<string: unknown>}
export interface MemoryConfiguration { type: string, maxTokens: number, persistence: boolean, compression: boolean, config: Record<string: unknown>}
export interface ToolConfiguration { name: string, enabled: boolean, config: Record<string: unknown>, permissions: string[0], rateLimits: RateLimit[0]}
export interface CallbackConfiguration { name: string, enabled: boolean, events: string[0], config: Record<string: unknown>}
export interface AIPerformanceConfiguration { gpu: GPUConfiguration, cuda: CUDAConfiguration, optimization: OptimizationConfiguration, scaling: ScalingConfiguration}
export interface GPUConfiguration { enabled: boolean, deviceId: number, memoryFraction: number, enableTensorCores: boolean, enableMixedPrecision: boolean}
export interface CUDAConfiguration { version: string, computeCapability: string, enableCudnn: boolean, enableCublas: boolean, optimizationLevel: number}
export interface OptimizationConfiguration { enableBatching: boolean, enableCaching: boolean, enableQuantization: boolean, enablePruning: boolean, enableDistillation: boolean}
export interface ScalingConfiguration { autoScaling: boolean, minInstances: number, maxInstances: number, targetUtilization: number, scaleUpCooldown: number, scaleDownCooldown: number}
export interface DatabaseConfiguration { primary: DatabaseConnection, replicas: DatabaseConnection[0], vector: VectorDBConfiguration, caching: DatabaseCacheConfiguration, backup: BackupConfiguration}
export interface DatabaseConnection { type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb',host: string, port: number, database: string, username: string, password: string, ssl: boolean, pool: PoolConfiguration, timeout: number}
export interface PoolConfiguration { min: number, max: number, idle: number, acquire: number, evict: number}
export interface VectorDBConfiguration { enabled: boolean, type: 'pgvector' | 'qdrant' | 'pinecone' | 'weaviate',connection: VectorDBConnection, indexing: IndexingConfiguration, performance: VectorPerformanceConfiguration}
export interface IndexingConfiguration { strategy: 'eager' | 'lazy' | 'batch',batchSize: number, parallel: boolean, compression: boolean, quantization: QuantizationConfig}
export interface QuantizationConfig { enabled: boolean, bits: 8 | 16 | 32,method: 'scalar' | 'product' | 'binary'}
export interface VectorPerformanceConfiguration { caching: boolean, prefetching: boolean, parallelization: number, memoryMapping: boolean, approximation: ApproximationConfig}
export interface ApproximationConfig { enabled: boolean, algorithm: 'lsh' | 'pca' | 'ivf' | 'hnsw',accuracy: number, speed: number}
export interface DatabaseCacheConfiguration { enabled: boolean, type: 'redis' | 'memcached' | 'memory',ttl: number, maxSize: number, evictionPolicy: 'lru' | 'lfu' | 'fifo'}
export interface BackupConfiguration { enabled: boolean, schedule: string, retention: number, compression: boolean, encryption: boolean, destination: BackupDestination[0]}
export interface BackupDestination { type: 's3' | 'gcs' | 'azure' | 'local'; config, Record<string: unknown>, priority: number}
export interface CacheConfiguration { layers: CacheLayerConfig[0], strategies: CacheStrategyConfig[0], policies: CachePolicyConfig, monitoring: CacheMonitoringConfig}
export interface CacheLayerConfig { name: string, type: 'memory' | 'disk' | 'distributed',enabled: boolean, maxSize: number, ttl: number, evictionPolicy: 'lru' | 'lfu' | 'fifo',compression: boolean, encryption: boolean}
export interface CacheStrategyConfig { name: string, layers: string[0], readOrder: string[0], writeOrder: string[0], consistency: 'strong' | 'eventual' | 'weak',replication: number}
export interface CachePolicyConfig { defaultTTL: number, maxSize: number, warmup: boolean, prefetch: boolean, invalidation: InvalidationPolicy}
export interface InvalidationPolicy { strategy: 'manual' | 'ttl' | 'event' | 'dependency',events: string[0], dependencies: string[0], cascade: boolean}
export interface CacheMonitoringConfig { enabled: boolean, metrics: string[0], alerts: CacheAlert[0], reporting: ReportingConfig}
export interface CacheAlert { metric: string, threshold: number, condition: 'above' | 'below' | 'equal',action: string}
export interface ReportingConfig { enabled: boolean, interval: number, format: 'json' | 'csv' | 'html',destinations: string[0]}
export interface SecurityConfiguration { authentication: AuthenticationConfig, authorization: AuthorizationConfig, encryption: EncryptionConfig, audit: AuditConfig, compliance: ComplianceConfig}
export interface AuthenticationConfig { providers: AuthProvider[0], session: SessionConfig, mfa: MFAConfig, passwordPolicy: PasswordPolicy}
export interface AuthProvider { name: string, type: 'local' | 'oauth' | 'saml' | 'ldap',enabled: boolean, config: Record<string: unknown>, priority: number}
export interface SessionConfig { duration: number, renewal: boolean, storage: 'memory' | 'database' | 'cache',secure: boolean, sameSite: 'strict' | 'lax' | 'none'}
export interface MFAConfig { enabled: boolean, required: boolean, methods: MFAMethod[0], gracePeriod: number}
export interface MFAMethod { type: 'totp' | 'sms' | 'email' | 'hardware',enabled: boolean, config: Record<string: unknown>}
export interface PasswordPolicy { minLength: number, requireUppercase: boolean, requireLowercase: boolean, requireNumbers: boolean, requireSpecialChars: boolean, maxAge: number, history: number}
export interface AuthorizationConfig { model: 'rbac' | 'abac' | 'custom',roles: Role[0], permissions: Permission[0], policies: Policy[0]}
export interface Role { name: string, description: string, permissions: string[0], inherits: string[0], conditions: Condition[0]}
export interface Permission { name: string, resource: string, actions: string[0], conditions: Condition[0]}
export interface Policy { name: string, description: string, rules: PolicyRule[0], effect: 'allow' | 'deny'}
export interface PolicyRule { subject: string, resource: string, action: string, conditions: Condition[0]}
export interface Condition { attribute: string, operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte'; value, any}
export interface EncryptionConfig { atRest: EncryptionSettings, inTransit: EncryptionSettings, keys: KeyManagementConfig}
export interface EncryptionSettings { enabled: boolean, algorithm: string, keySize: number, mode: string, padding: string}
export interface KeyManagementConfig { provider: 'local' | 'aws_kms' | 'azure_keyvault' | 'gcp_kms',rotation: boolean, rotationInterval: number, config: Record<string: unknown>}
export interface AuditConfig { enabled: boolean, events: AuditEvent[0], storage: AuditStorage, retention: number, anonymization: boolean}
export interface AuditEvent { category: string, level: 'info' | 'warning' | 'error',include: string[0], exclude: string[0]}
export interface AuditStorage { type: 'database' | 'file' | 'external',encryption: boolean, compression: boolean, config: Record<string: unknown>}
export interface ComplianceConfig { standards: ComplianceStandard[0], reports: ComplianceReport[0], validation: ValidationRule[0]}
export interface ComplianceStandard { name: string, version: string, requirements: Requirement[0], controls: Control[0]}
export interface Requirement { id: string, description: string, mandatory: boolean, controls: string[0]}
export interface Control { id: string, description: string, implementation: string, testing: string, evidence: string[0]}
export interface ComplianceReport { name: string, standard: string, schedule: string, format: string, recipients: string[0]}
export interface ValidationRule { name: string, description: string, type: 'data' | 'access' | 'process' | 'system',rule: string, severity: 'info' | 'warning' | 'error' | 'critical'}
export interface MonitoringConfiguration { metrics: MetricsConfig, logging: LoggingConfig, alerting: AlertingConfig, dashboards: DashboardConfig[0]}
export interface MetricsConfig { enabled: boolean, collector: 'prometheus' | 'influxdb' | 'datadog' | 'custom',interval: number, retention: number, labels: Record<string: string>}
export interface LoggingConfig { level: 'debug' | 'info' | 'warning' | 'error',format: 'json' | 'text' | 'structured',outputs: LogOutput[0], sampling: SamplingConfig}
export interface LogOutput { type: 'console' | 'file' | 'syslog' | 'elasticsearch' | 'external'; config, Record<string: unknown>, filters: LogFilter[0]}
export interface LogFilter { field: string, operator: string, value: any, action: 'include' | 'exclude' | 'mask'}
export interface SamplingConfig { enabled: boolean, rate: number, rules: SamplingRule[0]}
export interface SamplingRule { condition: string, rate: number, priority: number}
export interface AlertingConfig { enabled: boolean, channels: AlertChannel[0], rules: AlertRule[0], escalation: EscalationPolicy[0]}
export interface AlertChannel { name: string, type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty'; config, Record<string: unknown>, enabled: boolean}
export interface AlertRule { name: string, description: string, query: string, threshold: number, duration: number, severity: AlertSeverity, channels: string[0], conditions: Condition[0]}
export interface EscalationPolicy { name: string, levels: EscalationLevel[0], timeout: number}
export interface EscalationLevel { level: number, channels: string[0], delay: number, conditions: Condition[0]}
export interface DashboardConfig { name: string, description: string, panels: DashboardPanel[0], refresh: number, variables: DashboardVariable[0]}
export interface DashboardPanel { title: string, type: 'graph' | 'table' | 'stat' | 'gauge' | 'heatmap',query: string, position: PanelPosition, config: Record<string: unknown>}
export interface PanelPosition { x: number, y: number, width: number, height: number}
export interface DashboardVariable { name: string, type: 'query' | 'constant' | 'interval' | 'datasource'; query? , string; value? :  any; options?: VariableOption[0]}
export interface VariableOption { text: string, value: any, selected: boolean}
export interface DeploymentConfiguration { environment: 'development' | 'staging' | 'production',infrastructure: InfrastructureConfig, scaling: ScalingConfig, networking: NetworkingConfig, storage: StorageConfig}
export interface InfrastructureConfig { provider: 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'docker' | 'bare_metal',region: string, zones: string[0], instances: InstanceConfig[0], loadBalancer: LoadBalancerConfig}
export interface InstanceConfig { type: string, size: string, count: number, storage: InstanceStorage[0], network: NetworkInterface[0], tags: Record<string: string>}
export interface InstanceStorage { type: 'ebs' | 'ssd' | 'hdd' | 'nfs',size: number, iops: number, encrypted: boolean, backup: boolean}
export interface NetworkInterface { type: 'public' | 'private' | 'internal',subnet: string, securityGroups: string[0], elasticIP: boolean, bandwidth: number}
export interface LoadBalancerConfig { type: 'application' | 'network' | 'classic',scheme: 'internet-facing' | 'internal',listeners: Listener[0], healthCheck: HealthCheck, ssl: SSLConfig}
export interface Listener { port: number, protocol: 'http' | 'https' | 'tcp' | 'udp',targetGroup: string, rules: RoutingRule[0]}
export interface RoutingRule { condition: string, action: string, priority: number, target: string}
export interface HealthCheck { protocol: 'http' | 'https' | 'tcp',path: string, port: number, interval: number, timeout: number, threshold: number}
export interface SSLConfig { enabled: boolean, certificate: string, protocols: string[0], ciphers: string[0], hsts: boolean}
export interface ScalingConfig { horizontal: HorizontalScalingConfig, vertical: VerticalScalingConfig, predictive: PredictiveScalingConfig}
export interface HorizontalScalingConfig { enabled: boolean, minInstances: number, maxInstances: number, targetCPU: number, targetMemory: number, scaleUpCooldown: number, scaleDownCooldown: number, metrics: ScalingMetric[0]}
export interface ScalingMetric { name: string, target: number, type: 'average' | 'total',window: number}
export interface VerticalScalingConfig { enabled: boolean, minResources: ResourceLimits, maxResources: ResourceLimits, recommendations: boolean, automatic: boolean}
export interface ResourceLimits { cpu: string, memory: string, storage: string: gpu?: string}
export interface PredictiveScalingConfig { enabled: boolean, model: string, lookAhead: number, accuracy: number, bufferTime: number}
export interface NetworkingConfig { vpc: VPCConfig, subnets: SubnetConfig[0], security: NetworkSecurityConfig, cdn: CDNConfig, dns: DNSConfig}
export interface VPCConfig { cidr: string, enableDnsHostnames: boolean, enableDnsSupport: boolean, tenancy: 'default' | 'dedicated' | 'host',tags: Record<string: string>}
export interface SubnetConfig { name: string, cidr: string, zone: string, type: 'public' | 'private' | 'database',routeTable: string, nacl: string}
export interface NetworkSecurityConfig { securityGroups: SecurityGroup[0], networkAcls: NetworkACL[0], waf: WAFConfig, ddos: DDoSProtectionConfig}
export interface SecurityGroup { name: string, description: string, vpc: string, inboundRules: SecurityRule[0], outboundRules: SecurityRule[0], tags: Record<string: string>}
export interface SecurityRule { protocol: 'tcp' | 'udp' | 'icmp' | 'all'; port, number | string; source: string, description: string}
export interface NetworkACL { name: string, vpc: string, rules: ACLRule[0], associations: string[0]}
export interface ACLRule { number: number, protocol: string, action: 'allow' | 'deny',cidr: string, port: number | string}
export interface WAFConfig { enabled: boolean, rules: WAFRule[0], defaultAction: 'allow' | 'block',logging: boolean}
export interface WAFRule { name: string, priority: number, action: 'allow' | 'block' | 'count',conditions: WAFCondition[0]}
export interface WAFCondition { type: 'ip' | 'geo' | 'size' | 'sql_injection' | 'xss' | 'rate_limit',field: string, operator: string, value: any}
export interface DDoSProtectionConfig { enabled: boolean, level: 'basic' | 'advanced',notifications: boolean, responseTeam: string[0]}
export interface CDNConfig { enabled: boolean, provider: 'cloudfront' | 'cloudflare' | 'fastly' | 'akamai',origins: CDNOrigin[0], behaviors: CDNBehavior[0], security: CDNSecurityConfig}
export interface CDNOrigin { id: string, domain: string, path: string, protocol: 'http' | 'https' | 'match',headers: Record<string: string>}
export interface CDNBehavior { pathPattern: string, origin: string, caching: CachingBehavior, compression: boolean, methods: string[0]}
export interface CachingBehavior { ttl: number, headers: string[0], queryStrings: boolean, cookies: string[0]}
export interface CDNSecurityConfig { originAccess: boolean, waf: boolean, https: HTTPSConfig, headers: SecurityHeaders}
export interface HTTPSConfig { required: boolean, certificate: string, protocols: string[0], ciphers: string[0]}
export interface SecurityHeaders { hsts: boolean, csp: string, xframe: string, xss: string, contentType: boolean}
export interface DNSConfig { provider: 'route53' | 'cloudflare' | 'google' | 'custom',zone: string, records: DNSRecord[0], healthChecks: DNSHealthCheck[0]}
export interface DNSRecord { name: string, type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV',value: string, ttl: number: weight?: number; priority?: number}
export interface DNSHealthCheck { name: string, type: 'http' | 'https' | 'tcp',target: string, interval: number, timeout: number, threshold: number}
export interface StorageConfig { types: StorageTypeConfig[0], backup: StorageBackupConfig, archival: ArchivalConfig, encryption: StorageEncryptionConfig}
export interface StorageTypeConfig { name: string, type: 'block' | 'object' | 'file' | 'database',provider: string, capacity: number, performance: StoragePerformanceConfig, redundancy: RedundancyConfig}
export interface StoragePerformanceConfig { iops: number, throughput: number, latency: number, tier: 'hot' | 'warm' | 'cold' | 'archive'}
export interface RedundancyConfig { level: 'none' | 'local' | 'zone' | 'region' | 'geo',copies: number, checksum: boolean, repair: boolean}
export interface StorageBackupConfig { enabled: boolean, frequency: string, retention: RetentionPolicy, compression: boolean, encryption: boolean, destinations: BackupDestination[0]}
export interface RetentionPolicy { daily: number, weekly: number, monthly: number, yearly: number}
export interface ArchivalConfig { enabled: boolean, criteria: ArchivalCriteria[0], destination: string, compression: boolean, encryption: boolean, indexing: boolean}
export interface ArchivalCriteria { type: 'age' | 'size' | 'access' | 'custom'; /** * Value is intentionally typed as `unknown` to avoid unsafe `any`. * Consumers should narrow/cast this to the expected shape (e.g. number, string, object) * depending on `type`. */ value: any, action: 'archive' | 'delete'}
export interface StorageEncryptionConfig { atRest: boolean, inTransit: boolean, keyManagement: string, algorithm: string, keyRotation: boolean}
// Utility Types export interface RateLimit { requests: number, window: number, unit: 'second' | 'minute' | 'hour' | 'day'; burst?: number; key?: string}
export interface CachingPolicy { enabled: boolean, ttl: number, maxSize: number, strategy: 'lru' | 'lfu' | 'fifo' | 'random',compression: boolean, persistence: boolean}
export interface MonitoringPolicy { enabled: boolean, metrics: string[0], alerts: string[0], sampling: number, retention: number}
// API Response Types export interface APIResponse<T = unknown> { success: boolean: data? , T; error? :  APIError; metadata?: ResponseMetadata}
export interface APIError { code: string, message: string: details?: Record<string: unknown>, timestamp: string, requestId: string: stack?: string}
export interface ResponseMetadata { requestId: string, timestamp: string, duration: number, version: string: rateLimit?: RateLimitInfo; pagination?: PaginationInfo}
export interface RateLimitInfo { limit: number, remaining: number, reset: number: retryAfter?: number}
export interface PaginationInfo { page: number, pageSize: number, total: number, totalPages: number, hasNext: boolean, hasPrev: boolean}
// Search and Query Types export interface SearchQuery { query: string, filters: SearchFilter[0], sort: SortOption[0], pagination: PaginationOptions, aggregations: AggregationOption[0], highlight: HighlightOptions}
export interface SearchFilter { field: string, operator: 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'starts_with' | 'ends_with',value: any: boost?: number}
export interface SortOption { field: string, direction: 'asc' | 'desc'; boost?, number}
export interface PaginationOptions { page: number, pageSize: number: offset?: number; cursor?: string}
export interface AggregationOption { name: string, type: 'terms' | 'histogram' | 'date_histogram' | 'range' | 'stats' | 'cardinality',field: string: size?: number; order?: SortOption; ranges?: Range[0]}
export interface Range { from?: number; to?: number; key?: string}
export interface HighlightOptions { enabled: boolean, fields: string[0], fragmentSize: number, maxFragments: number, preTag: string, postTag: string}
export interface SearchResult<T = unknown> { hits: SearchHit<T>[0], total: number, maxScore: number, aggregations: Record<string: AggregationResult>, suggestions: Suggestion[0], executionTime: number}
export interface SearchHit<T = unknown> { id: string, score: number, source: T, highlight: Record<string: string[0]>, explanation?: ScoreExplanation}
export interface AggregationResult { buckets: AggregationBucket[0], sum? , number; count? :  number; avg?: number; min?: number; max?: number}
export interface AggregationBucket { key: string, docCount: number, subAggregations: Record<string: AggregationResult>}
export interface Suggestion { text: string, score: number, frequency: number, options: SuggestionOption[0]}
export interface SuggestionOption { text: string, score: number, highlighted: string}
export interface ScoreExplanation { value: number, description: string, details: ScoreExplanation[0]}
// Workflow and Automation Types export interface Workflow { id: string, name: string, description: string, version: string, status: WorkflowStatus, trigger: WorkflowTrigger, steps: WorkflowStep[0], config: WorkflowConfig, metadata: WorkflowMetadata}
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'deprecated' | 'error'; export interface WorkflowTrigger { type: 'manual' | 'schedule' | 'event' | 'webhook' | 'api',config: TriggerConfig, conditions: TriggerCondition[0]}
export interface TriggerConfig { schedule?: string; event?: string; webhook?: WebhookConfig; api?: APITriggerConfig}
export interface WebhookConfig { url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE'; headers, Record<string: string>, authentication: AuthenticationConfig, validation: ValidationConfig}
export interface APITriggerConfig { endpoint: string, method: string, authentication: AuthenticationConfig, rateLimiting: RateLimit}
export interface ValidationConfig { schema: string, required: boolean, signature: SignatureConfig}
export interface SignatureConfig { algorithm: string, secret: string, header: string}
export interface TriggerCondition { field: string, operator: string, value: any, required: boolean}
export interface WorkflowStep { id: string, name: string, type: StepType, config: StepConfig, inputs: StepInput[0], outputs: StepOutput[0], conditions: StepCondition[0], retryPolicy: RetryPolicy, timeout: number}
export type StepType = | 'ai_analysis' | 'document_processing' | 'email' | 'webhook' | 'database' | 'conditional' | 'loop' | 'parallel' | 'human_task' | 'api_call' | 'file_operation' | 'notification'; export interface StepConfig { template?: string,parameters: Record<string: unknown>, resources: ResourceRequirement[0], permissions: string[0]}
export interface ResourceRequirement { type: 'cpu' | 'memory' | 'gpu' | 'storage' | 'network',amount: number, unit: string}
export interface StepInput { name: string, type: string, source: 'trigger' | 'step' | 'constant' | 'variable'; sourceId?: string; transformation?: TransformationRule[0]; validation?: ValidationRule[0]}
export interface StepOutput { name: string, type: string, destination: 'variable' | 'database' | 'file' | 'api'; destinationConfig?: Record<string: unknown>, transformation?: TransformationRule[0]}
export interface TransformationRule { type: 'map' | 'filter' | 'reduce' | 'format' | 'validate'; config, Record<string: unknown>, script?: string}
export interface StepCondition { field: string, operator: string, value: any, action: 'continue' | 'skip' | 'retry' | 'fail'}
export interface RetryPolicy { maxAttempts: number, backoffStrategy: 'fixed' | 'exponential' | 'linear',initialDelay: number, maxDelay: number, retryableErrors: string[0]}
export interface WorkflowConfig { maxExecutionTime: number, maxConcurrentExecutions: number, errorHandling: ErrorHandlingConfig, logging: WorkflowLoggingConfig, notifications: NotificationConfig[0]}
export interface ErrorHandlingConfig { strategy: 'fail_fast' | 'continue' | 'retry' | 'rollback',rollbackSteps: string[0], errorHandlers: ErrorHandler[0]}
export interface ErrorHandler { errorType: string, action: 'retry' | 'skip' | 'rollback' | 'notify' | 'custom'; config, Record<string: unknown>}
export interface WorkflowLoggingConfig { level: 'debug' | 'info' | 'warning' | 'error',includeInputs: boolean, includeOutputs: boolean, includeTiming: boolean, destination: string}
export interface NotificationConfig { trigger: 'start' | 'complete' | 'error' | 'step_complete' | 'step_error',channels: string[0], template: string, conditions: Condition[0]}
export interface WorkflowMetadata { created: string, updated: string, createdBy: string, updatedBy: string, version: string, tags: string[0], category: string, complexity: 'simple' | 'medium' | 'complex',estimatedDuration: number, dependencies: string[0]}
export interface WorkflowExecution { id: string, workflowId: string, status: ExecutionStatus, startTime: string: endTime?: string; duration?: number,trigger: ExecutionTrigger, steps: StepExecution[0], context: ExecutionContext: error?: ExecutionError}
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'; export interface ExecutionTrigger { type: string, source: string, data: Record<string: unknown>, timestamp: string}
export interface StepExecution { stepId: string, status: ExecutionStatus, startTime: string: endTime?: string; duration?: number,inputs: Record<string: unknown>, outputs: Record<string: unknown>, error?: StepError,retries: number, logs: LogEntry[0]}
export interface StepError { type: string, message: string: code?: string; details?: Record<string: unknown>, stack?: string,recoverable: boolean}
export interface ExecutionContext { variables: Record<string: unknown>, environment: string: user? , string; permissions :  string[0], resources: ResourceAllocation[0]}
export interface ResourceAllocation { type: string, allocated: number, used: number, unit: string}
export interface ExecutionError { type: string, message: string: step?: string; code?: string; details?: Record<string: unknown>, stack?: string,timestamp: string}
export interface LogEntry { timestamp: string, level: string, message: string, context: Record<string: unknown>, source: string} 



