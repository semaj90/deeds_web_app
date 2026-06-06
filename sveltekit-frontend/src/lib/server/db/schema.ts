// KAG-DAG Architecture (Phase 79)
// src/lib/server/db/schema.ts
// Main schema file - re-exports from schema-postgres.ts
// This is the canonical schema for the legal AI application

export * from './schema-postgres';
export * from './schema/evidence-multi-modal';

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
    chatMetadata, toolTraces, type ChatMessage, type ChatMetadata, type ToolTrace, type NewChatMessage, type NewChatMetadata, type NewToolTrace
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

// Saved citation flow schema (citation bookmarks + annotations + board edges)
export {
	savedCitations,
	savedCitationAnnotations,
	evidenceBoardEdges,
	CITATION_ANNOTATION_EVENTS,
	CITATION_ANNOTATION_PROGRESS_STATES,
	type CitationAnnotationProgressState,
	citationAnnotationRedisKeys,
	type SavedCitationAnnotation,
	type NewSavedCitationAnnotation,
	type EvidenceBoardEdge,
	type NewEvidenceBoardEdge,
} from './schema/citations';

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

// Phase 102: Persons of Interest & Legal Cases (Metadata spine dependencies)
// schema-postgres is the canonical source for `cases`, `casesRelations`,
// and `personsOfInterest`. Re-export only the spine-only additions here
// to avoid duplicate-symbol ambiguity errors (TS2308).
export {
	crimes, caseChunks,
	crimesRelations, caseChunksRelations,
} from './schema/legal-cases';

// Metadata Spine (Phase 78/79)
// codeRelations / CodeRelation / NewCodeRelation are already exported from schema-postgres above
export {
	metadataEnvelopes, codebaseAuditEvents, aceRetrievalRuns, aceRetrievalHits,
	type MetadataEnvelope, type NewMetadataEnvelope,
	type CodebaseAuditEvent, type NewCodebaseAuditEvent,
	type AceRetrievalRun, type NewAceRetrievalRun,
	type AceRetrievalHit, type NewAceRetrievalHit,
} from './schema/metadata-spine';

// KAG-DAG Architecture (Phase 79)
export * from './schema/kag-dag';
export * from './schema/directory-clusters';
export * from './schema/embedded-summaries';
export * from './schema/topology';
export * from './schema/graph-pathway-cards';
export * from './schema/admin-chat';
export * from './schema/admin-ai-skills';
export {
	gpuClusterCentroids,
	type GpuClusterCentroid,
	type NewGpuClusterCentroid
} from './schema/codebase-intelligence';
export {
	summaryCards,
	type SummaryCard,
	type NewSummaryCard
} from './schema/summary-cards';
export {
	tokenMapCards,
	type TokenMapCardRow,
	type NewTokenMapCardRow
} from './schema/token-map';
// schema-search defines rgSearchRuns/rgSearchHits which also live in schema-postgres.
// Export only the unique tables from schema-search to avoid barrel ambiguity.
export { rgSearchResults, searchCentroids } from './schema-search';
export * from './schema/models';
export * from './schema/admin-model-weights';
export * from './schema/files';
export * from './schema/memory-registry';
export * from './schema/schema-graph.js';
export * from './schema/schema-semantic-cache.js';
export * from './schema/documents-atlas.js';
export * from './schema/feature-registry.js';
export * from './schema/atlas-cards.js';
export * from './schema/synthesis-logs.js';

export * from './schema/atlas-dict.js';
export * from './schema/parent-atlas-jobs.js';
export * from './schema/parent-atlas-documents.js';
export * from './schema/atlas-feature-map-synthesized.js';
export * from './schema/route_runtime_packets.js';
