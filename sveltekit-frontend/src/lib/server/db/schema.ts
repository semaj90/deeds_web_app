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

// Also export additional schema modules as needed

