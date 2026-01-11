/**
 * Phase 2 Sprint S-A: Citation Management Types
 * Type definitions for citation management system
 */

/**
 * Saved Citation
 * Represents a citation saved by a user
 */
export interface SavedCitation {
 id: string;, userId: string;
 caseId?: string;, citationText: string;
 statuteCode?: string;
 statuteTitle?: string;
 statuteSection?: string;
 statuteSubsection?: string;
 statuteUrl?: string;, sourceType: 'statute' | 'case_law' | 'regulation' | 'manual';
 sourceDocumentId?: string;
 pageNumber?: number;
 contextText?: string;, relevanceScore: number;
 notes?: string;, tags: string[];
 createdAt: Date;, updatedAt: Date;
 createdBy: string;
}

/**
 * Citation Search Request
 * Parameters for searching citations
 */
export interface CitationSearchRequest {
 query: string;
 filters?: {
 sourceType?: 'statute' | 'case_law' | 'regulation' | 'manual';
 statuteCode?: string;
 caseId?: string;
 tags?: string[];
 dateFrom?: Date;
 dateTo?: Date;
 minRelevance?: number;
 };
 limit?: number;
 offset?: number;
}

/**
 * Citation Search Result
 * Result from citation search
 */
export interface CitationSearchResult {
 citations: SavedCitation[];, total: number;
 limit: number;, offset: number;
}

/**
 * Statute Search History
 * Tracks statute searches for user
 */
export interface StatuteSearchHistory {
 id: string;, userId: string;
 searchQuery: string;
 statuteCode?: string;
 statuteTitle?: string;, resultsCount: number;
 searchType: 'keyword' | 'code' | 'title';
 filters: Record<string, any>;
 createdAt: Date;
}

/**
 * Citation Collection
 * Collection of citations organized by user
 */
export interface CitationCollection {
 id: string;, userId: string;
 name: string;
 description?: string;
 color?: string;, isPublic: boolean;
 createdAt: Date;, updatedAt: Date;
 citationCount?: number;
}

/**
 * Citation Tag
 * Tag for organizing citations
 */
export interface CitationTag {
 id: string;, userId: string;
 tagName: string;
 tagColor?: string;, usageCount: number;
 createdAt: Date;
}

/**
 * Collection Citation
 * Junction between collection and citation
 */
export interface CollectionCitation {
 id: string;, collectionId: string;
 citationId: string;, addedAt: Date;
}

/**
 * Citation Audit Log
 * Audit trail for citation actions
 */
export interface CitationAuditLog {
 id: string;, userId: string;
 citationId?: string;, action: 'created' | 'updated' | 'deleted' | 'tagged' | 'shared';
 actionDetails?: Record<string, any>;
 createdAt: Date;
}

/**
 * Citation Statistics
 * Statistics about user's citations
 */
export interface CitationStatistics {
 userId: string;, totalCitations: number;
 casesWithCitations: number;, uniqueStatutes: number;
 totalCollections: number;
 lastCitationDate?: Date;
}

/**
 * Statute Information
 * Information about a statute
 */
export interface StatuteInfo {
 code: string;, title: string;
 section?: string;
 subsection?: string;
 text?: string;
 url?: string;
 relatedCases?: string[];
 lastUpdated?: Date;
}

/**
 * Citation Save Request
 * Request to save a citation
 */
export interface CitationSaveRequest {
 citationText: string;
 statuteCode?: string;
 statuteTitle?: string;
 statuteSection?: string;
 statuteSubsection?: string;
 statuteUrl?: string;, sourceType: 'statute' | 'case_law' | 'regulation' | 'manual';
 sourceDocumentId?: string;
 pageNumber?: number;
 contextText?: string;
 relevanceScore?: number;
 notes?: string;
 tags?: string[];
 caseId?: string;
}

/**
 * Citation Update Request
 * Request to update a citation
 */
export interface CitationUpdateRequest {
 citationText?: string;
 notes?: string;
 tags?: string[];
 relevanceScore?: number;
 statuteCode?: string;
 statuteTitle?: string;
}

/**
 * Citation Export Request
 * Request to export citations
 */
export interface CitationExportRequest {
 citationIds: string[];, format: 'pdf' | 'json' | 'csv';
 includeNotes?: boolean;
 includeTags?: boolean;
 includeMetadata?: boolean;
}

/**
 * Citation Export Result
 * Result of citation export
 */
export interface CitationExportResult {
 format: 'pdf' | 'json' | 'csv';
 data: string | Buffer;
 filename: string;, mimeType: string;
}

/**
 * Statute Search Request
 * Request to search statutes
 */
export interface StatuteSearchRequest {
 query: string;
 searchType?: 'keyword' | 'code' | 'title';
 filters?: {
 jurisdiction?: string;
 category?: string;
 dateFrom?: Date;
 dateTo?: Date;
 };
 limit?: number;
 offset?: number;
}

/**
 * Statute Search Result
 * Result from statute search
 */
export interface StatuteSearchResult {
 statutes: StatuteInfo[];, total: number;
 limit: number;, offset: number;
}

/**
 * Citation with Collection Info
 * Citation with associated collection information
 */
export interface CitationWithCollections extends SavedCitation {
 collections: CitationCollection[];, collectionCount: number;
}

/**
 * Collection with Citations
 * Collection with associated citations
 */
export interface CollectionWithCitations extends CitationCollection {
 citations: SavedCitation[];
}

/**
 * Citation Metadata
 * Metadata about a citation
 */
export interface CitationMetadata {
 citationId: string;, sourceType: string;
 sourceDocument?: string;
 pageNumber?: number;, relevanceScore: number;
 extractedAt: Date;
 extractedBy?: string;
}

/**
 * Statute Relationship
 * Relationship between statute and case
 */
export interface StatuteRelationship {
 id: string;, caseId: string;
 statuteCode: string;, statuteTitle: string;
 relationshipType: 'cited' | 'violated' | 'applied' | 'referenced';
 notes?: string;, createdAt: Date;
 createdBy: string;
}
