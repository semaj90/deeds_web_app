// src/lib/server/db/schema.ts
// Main schema file - re-exports from schema-postgres.ts
// This is the canonical schema for the legal AI application

export * from './schema-postgres';

// Evidence CRUD + RAG Integration tables
export {
    JURISDICTIONS, auditOperationEnum,
    auditTableEnum,
    citationTags,
    evidenceTags, jurisdictionEnum, ragIndexMetadata, type AuditLogEntry
} from './schema-evidence-crud';

// Phase 80: Chat Messages Schema
export {
    chatMessageRoleEnum, chatMessages,
    chatMetadata, type ChatMessage, type ChatMetadata, type NewChatMessage, type NewChatMetadata
} from './schema-chat';

// ACE Web Ingestion Schema
export {
    aceChunks, aceDocs, aceSources, type AceChunk
} from '../../db/schema/ace-web';

// Canvas & Autosaves Schema (Phase 76+ / NES Integration)
// export * from './schema-canvas-autosaves';
// export * from './schema-canvas';

// Phase 89 Preserved Tables - DO NOT DELETE
// Contains 1.2M+ records of error analysis data
export * from './schema-phase89-preserved';

// Warden Legal Evidence Schema (Phase 103 Integration)
export * from './warden-schema';

// Saved Citations Schema (user-saved citation bookmarks)
export { savedCitations } from './schema/citations';

// Analytics events (used by event-logger.ts)
export { userAnalyticsEvents, type UserAnalyticsEvent, type NewUserAnalyticsEvent } from './schema/analytics';

// Search analytics pipeline tables (search-intelligence dashboard + QLoRA training)
export {
	chunkHitLog,       type ChunkHitLog,       type NewChunkHitLog,
	queryVariancePairs,type QueryVariancePair,  type NewQueryVariancePair,
	ragQueryLog,       type RagQueryLog,        type NewRagQueryLog,
	qloraExamples,     type QloraExample,       type NewQloraExample,
	responseFeedback,  type ResponseFeedback,   type NewResponseFeedback,
} from './schema/search-analytics';

// === UNIVERSAL LEGAL CORPUS SCHEMA ===
// Layer 1: Canonical legal structure
export {
	jurisdictions, type Jurisdiction, type NewJurisdiction
} from './schema/jurisdictions';
export {
	libraryDocuments, sourceTypeEnum, corpusTypeEnum, processingStatusEnum,
	type LibraryDocument, type NewLibraryDocument
} from './schema/library-documents';
export {
	libraryDocumentVersions,
	type LibraryDocumentVersion, type NewLibraryDocumentVersion
} from './schema/library-document-versions';
export {
	legalNodes, legalNodeTypeEnum,
	type LegalNode, type NewLegalNode
} from './schema/legal-nodes';
export {
	legalDefinitions,
	type LegalDefinition, type NewLegalDefinition
} from './schema/legal-definitions';
export {
	legalCitations, citationTypeEnum,
	type LegalCitation, type NewLegalCitation
} from './schema/legal-citations';

// Layer 2: Retrieval/index
export {
	legalChunks,
	type LegalChunk, type NewLegalChunk
} from './schema/legal-chunks';

// Pipeline & provenance
export {
	pageArtifacts,
	type PageArtifact, type NewPageArtifact
} from './schema/page-artifacts';
export {
	ingestionJobs,
	type IngestionJob, type NewIngestionJob
} from './schema/ingestion-jobs';
export {
	stateConstitutionSources,
	type StateConstitutionSource, type NewStateConstitutionSource
} from './schema/state-constitution-sources';

// Case ↔ corpus linkage
export {
	caseLibraryLinks, caseLinkCategoryEnum,
	type CaseLibraryLink, type NewCaseLibraryLink
} from './schema/case-library-links';

// Case ↔ person junction (persons_of_interest canonical def is in schema-postgres.ts)
export { casePersons } from './schema/persons';

// Drizzle relations for all legal corpus tables
export {
	jurisdictionsRelations, libraryDocumentsRelations,
	libraryDocumentVersionsRelations, legalNodesRelations,
	legalChunksRelations, legalDefinitionsRelations,
	legalCitationsRelations, pageArtifactsRelations,
	ingestionJobsRelations, stateConstitutionSourcesRelations
} from './schema/legal-relations';
