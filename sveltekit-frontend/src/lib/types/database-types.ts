/**
 * Superior TypeScript types for legal_ai_db wiring
 * Phase 2A: Enhanced type safety for Drizzle ORM + PostgreSQL + RabbitMQ
 */

import type * as schema from '$lib/server/db/schema-postgres';
import type { Channel, ConfirmChannel, Connection } from 'amqplib';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Redis } from 'ioredis';

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * Drizzle database instance with full schema
 */
export type LegalAIDatabase = PostgresJsDatabase<typeof schema>;

/**
 * Inferred types from Drizzle schema
 */
export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;

export type Case = typeof schema.cases.$inferSelect;
export type NewCase = typeof schema.cases.$inferInsert;

export type Evidence = typeof schema.evidence.$inferSelect;
export type NewEvidence = typeof schema.evidence.$inferInsert;

export type Document = typeof schema.legalDocuments.$inferSelect;
export type NewDocument = typeof schema.legalDocuments.$inferInsert;

export type Criminal = typeof schema.criminals.$inferSelect;
export type NewCriminal = typeof schema.criminals.$inferInsert;

export type ChatMessage = typeof schema.chatMessages.$inferSelect;
export type NewChatMessage = typeof schema.chatMessages.$inferInsert;

// Enums
export type UserRole = typeof schema.userRoleEnum.enumValues[number];
export type CaseStatus = typeof schema.caseStatusEnum.enumValues[number];
export type CasePriority = typeof schema.casePriorityEnum.enumValues[number];
export type EvidenceType = typeof schema.evidenceTypeEnum.enumValues[number];
export type ThreatLevel = typeof schema.threatLevelEnum.enumValues[number];

// ============================================================================
// RABBITMQ TYPES
// ============================================================================

/**
 * RabbitMQ connection wrapper
 */
export interface RabbitMQConnection {
	connection: Connection;
	channel: Channel;
	confirmChannel?: ConfirmChannel;
	isConnected: boolean;
}

/**
 * Queue message with type safety
 */
export interface QueueMessage<T = unknown> {
	id: string;
	type: string;
	data: T;
	timestamp: string;
	attempts?: number;
	maxAttempts?: number;
}

/**
 * Legal AI job types
 */
export type LegalAIJobType =
	| 'document_processing'
	| 'entity_extraction'
	| 'risk_assessment'
	| 'embedding_generation'
	| 'summary_generation';

/**
 * Legal AI job payload
 */
export interface LegalAIJob {
	jobId: string;
	jobType: LegalAIJobType;
	documentId: string;
	caseId?: string;
	userId: string;
	content: string;
	options?: {
		extractEntities?: boolean;
		generateSummary?: boolean;
		assessRisk?: boolean;
		generateEmbedding?: boolean;
		storeInDatabase?: boolean;
		useGemma3Legal?: boolean;
		priority?: number;
		delay?: number;
	};
	metadata?: Record<string, unknown>;
}

// ============================================================================
// REDIS TYPES
// ============================================================================

/**
 * Redis cache entry
 */
export interface CacheEntry<T = unknown> {
	value: T;
	ttl?: number;
	createdAt: string;
	expiresAt?: string;
}

/**
 * Redis job status
 */
export interface JobStatus {
	jobId: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	startedAt?: string;
	finishedAt?: string;
	error?: string;
	result?: unknown;
}

// ============================================================================
// INTEGRATION TYPES
// ============================================================================

/**
 * Database + Queue + Cache integration
 */
export interface LegalAIServices {
	db: LegalAIDatabase;
	redis: Redis;
	rabbitmq: RabbitMQConnection;
}

/**
 * Service health status
 */
export interface ServiceHealth {
	service: 'postgres' | 'redis' | 'rabbitmq' | 'qdrant';
	status: 'healthy' | 'degraded' | 'down';
	latency?: number;
	error?: string;
	timestamp: string;
}

/**
 * System status
 */
export interface SystemStatus {
	services: ServiceHealth[];
	overall: 'healthy' | 'degraded' | 'down';
	timestamp: string;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Pagination parameters
 */
export interface PaginationParams {
	page?: number;
	limit?: number;
	offset?: number;
}

/**
 * Sort parameters
 */
export interface SortParams {
	field: string;
	order: 'asc' | 'desc';
}

/**
 * Filter parameters for cases
 */
export interface CaseFilters {
	status?: CaseStatus[];
	priority?: CasePriority[];
	userId?: string;
	assignedAttorney?: string;
	jurisdiction?: string;
	practiceArea?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
}

/**
 * Filter parameters for evidence
 */
export interface EvidenceFilters {
	caseId?: string;
	type?: EvidenceType[];
	userId?: string;
	search?: string;
	dateFrom?: string;
	dateTo?: string;
	tags?: string[];
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

// ============================================================================
// AI PROCESSING TYPES
// ============================================================================

/**
 * Legal entity extracted by AI
 */
export interface LegalEntity {
	name: string;
	type: 'person' | 'organization' | 'location' | 'date' | 'statute' | 'case_citation' | 'other';
	value: string;
	confidence: number;
	start_pos: number;
	end_pos: number;
	metadata?: Record<string, unknown>;
}

/**
 * Risk assessment result
 */
export interface RiskAssessment {
	overall_risk: 'low' | 'medium' | 'high' | 'critical';
	risk_score: number;
	risk_factors: string[];
	recommendations: string[];
	confidence: number;
	metadata?: Record<string, unknown>;
}

/**
 * Document summary
 */
export interface DocumentSummary {
	summary: string;
	key_points: string[];
	word_count: number;
	reading_time_minutes: number;
	generated_at: string;
}

/**
 * Processing result from Go server
 */
export interface ProcessingResult {
	success: boolean;
	document_id: string;
	summary?: DocumentSummary;
	entities?: LegalEntity[];
	risk_assessment?: RiskAssessment;
	embedding?: number[];
	processing_time: string;
	metadata: Record<string, unknown>;
	error?: string;
}

// ============================================================================
// VECTOR SEARCH TYPES
// ============================================================================

/**
 * Vector search parameters
 */
export interface VectorSearchParams {
	query: string;
	embedding?: number[];
	limit?: number;
	threshold?: number;
	filter?: Record<string, unknown>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult<T = unknown> {
	id: string;
	score: number;
	item: T;
	metadata?: Record<string, unknown>;
}

// ============================================================================
// EXPORT ALL SCHEMA TYPES
// ============================================================================

export type {
    Channel,
    ConfirmChannel, Connection, ConsumeMessage
} from 'amqplib';

export type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
export type { Redis } from 'ioredis';

