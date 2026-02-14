/**
 * Database API response types
 * Comprehensive types for all db.query() operations and responses
 */

// ============================================================================
// BASE QUERY TYPES
// ============================================================================

export interface QueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ListQueryResult<T> {
  success: boolean;
  data?: T[];
	count: number;
  total?: number;
  offset?: number;
  limit?: number;
  pagination?: PaginationInfo;
  error?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface PaginationInfo {
  page: number;
	pageSize: number;
  total: number;
	pages: number;
  hasMore: boolean;
}

export interface CreateQueryResult<T> extends QueryResult<T> {
  id?: string;
}

export interface UpdateQueryResult<T> extends QueryResult<T> {
  updated: boolean;
}

export interface DeleteQueryResult {
  success: boolean;
	deleted: boolean;
  error?: string;
  timestamp?: string;
}

// ============================================================================
// HEALTH CHECK TYPES
// ============================================================================

export interface DatabaseHealthResponse {
  healthy: boolean;
	database: string;
  version: string;
	timestamp: string;
  message: string;
}

export type { DatabaseHealthResponse as HealthCheck };

// ============================================================================
// CORE ENTITY TYPES
// ============================================================================

export interface User {
  id: string;
	email: string;
  name: string;
	firstName: string | null;
  lastName: string | null;
  role: string;
	isActive: boolean;
  avatarUrl: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

// NOTE: Renamed to avoid duplicate identifier collisions across the workspace.
export interface DBCase {
  id: string;
	title: string;
  description: string | null;
  createdBy: string;
	createdAt: Date | string;
  updatedAt: Date | string;
  status: string;
	metadata: CaseMetadata | null;
}

// Alias for convenience/backward compatibility
export type Case = DBCase;

export interface CaseMetadata {
  jurisdiction?: string;
  parties?: Array<{
	role: string; name: string;
	type: string }>;
  courtLevel?: 'district' | 'appellate' | 'supreme';
  caseNumber?: string;
  datesFiled?: string[];
  notes?: string;
  [key: string]: any;
}

// NOTE: Renamed to avoid duplicate identifier collisions across the workspace.
export interface DBEvidence {
  id: string;
	caseId: string;
  title: string;
	description: string | null;
  evidenceType: string;
  subType?: string | null;
  summary?: string | null;
  aiSummary?: string | null;
  aiAnalysis?: EvidenceAnalysis | null;
  tags?: string[] | null;
  uploadedBy?: string;
  isAdmissible?: boolean;
  confidentialityLevel?: string;
  collectedAt?: Date | string | null;
  location?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  embedding?: number[] | null;
  metadata?: EvidenceMetadata | null;
}

// Alias for convenience/backward compatibility
export type Evidence = DBEvidence;

export interface EvidenceAnalysis {
  documentType?: string;
  classification?: string;
  extractedEntities?: string[];
  keyTerms?: string[];
  sentiment?: number;
  confidence?: number;
  [key: string]: any;
}

export interface EvidenceMetadata {
  fileHash?: string;
  fileSize?: number;
  mimeType?: string;
  sourceSystem?: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  ocrResult?: string | null;
  vectorSearchScore?: number;
  [key: string]: any;
}

export interface ChainOfCustodyRecord {
  id: string;
	evidenceId: string;
  timestamp: string | Date;
  handler: string;
	action: string;
  location?: string;
  notes?: string;
}

export interface Document {
  id: string;
	userId: string;
  content: string | null;
  embedding?: number[] | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface ChatMessage {
  id: string;
	userId: string;
  content: string;
	timestamp: Date | string;
  sessionId: string;
	messageType: 'user' | 'assistant' | 'system';
  metadata?: ChatMessageMetadata | null;
}

export interface ChatMessageMetadata {
  intent?: string;
  confidence?: number;
  topics?: string[];
  sentiment?: number;
  [key: string]: any;
}

export interface AnalysisResult {
  analysisId: string;
	evidenceId: string;
  results: Record<string, unknown>;
  analysisTypes: string[];
	confidence: number;
  processingTime: number;
	createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================================================
// SPECIFIC DOMAIN QUERY RESULTS
// ============================================================================

export interface CaseQueryResult extends QueryResult<DBCase> { }
export interface CaseListResult extends ListQueryResult<DBCase> { }
export interface EvidenceQueryResult extends QueryResult<DBEvidence> { }
export interface EvidenceListResult extends ListQueryResult<DBEvidence> { }
export interface UserQueryResult extends QueryResult<User> { }
export interface UserListResult extends ListQueryResult<User> { }
export interface ChatMessageQueryResult extends QueryResult<ChatMessage> { }
export interface ChatMessageListResult extends ListQueryResult<ChatMessage> { }
export interface DocumentQueryResult extends QueryResult<Document> { }
export interface DocumentListResult extends ListQueryResult<Document> { }
export interface AnalysisResultQueryResult extends QueryResult<AnalysisResult> { }
export interface AnalysisResultListResult extends ListQueryResult<AnalysisResult> { }

// ============================================================================
// VECTOR SEARCH TYPES
// ============================================================================

export interface DBVectorSearchResult {
  id: string;
	title: string;
  content: string;
	similarity: number;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// Alias
export type VectorSearchResult = DBVectorSearchResult;

export interface VectorSearchQueryResult {
  success: boolean;
  results?: DBVectorSearchResult[];
	query: string;
  queryEmbedding?: number[];
	totalResults: number;
  error?: string;
}

// ============================================================================
// BATCH OPERATION TYPES
// ============================================================================

export interface BatchQueryResult<T> {
  success: boolean;
	results: Array<{
    id: string;
	success: boolean;
    data?: T;
    error?: string;
  }>;
  successCount: number;
	failureCount: number;
  error?: string;
}

export interface Transaction {
  id: string;
	status: 'pending' | 'committed' | 'rolled_back';
  operations: Array<{
	type: 'insert' | 'update' | 'delete';
    table: string;
	data: Record<string, unknown>;
  }>;
  createdAt: Date | string;
  completedAt?: Date | string;
}



