// src/lib/server/db/schema.ts
// Main schema file - re-exports from schema-postgres.ts
// This is the canonical schema for the legal AI application

export * from './schema-postgres.ts';

// Evidence CRUD + RAG Integration tables
export {
    JURISDICTIONS, auditOperationEnum,
    auditResourceTypeEnum,
    citationTags,
    evidenceTags, jurisdictionEnum, ragIndexMetadata, type AuditLogEntry,
    // auditLog, // Excluded to avoid conflict with schema-postgres.ts
    type CitationTag, type EvidenceTag, type Jurisdiction, type NewAuditLogEntry, type NewCitationTag, type NewEvidenceTag, type NewRAGIndexMetadata, type RAGIndexMetadata
} from './schema-evidence-crud.ts';

// Phase 80: Chat Messages Schema
export {
    chatMessageRoleEnum, chatMessages,
    chatMetadata, type ChatMessage, type ChatMetadata, type NewChatMessage, type NewChatMetadata
} from './schema-chat.ts';

// ACE Web Ingestion Schema
export {
    aceChunks, aceDocs, aceSources, type AceChunk,
    type AceDoc, type AceSource
} from '../../db/schema/ace-web.ts';

// Canvas & Autosaves Schema (Phase 76+ / NES Integration)
export * from './schema-canvas.ts';
export * from './schema-canvas-autosaves.ts';

// Phase 89 Preserved Tables - DO NOT DELETE
// Contains 1.2M+ records of error analysis data
export * from './schema-phase89-preserved.ts';

// Also export additional schema modules as needed
