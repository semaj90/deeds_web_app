// src/lib/server/db/schema.ts
// Main schema file - re-exports from schema-postgres.ts
// This is the canonical schema for the legal AI application

export * from './schema-postgres';

// Evidence CRUD + RAG Integration tables
export {
    JURISDICTIONS, auditOperationEnum,
    auditResourceTypeEnum,
    citationTags,
    evidenceTags, jurisdictionEnum, ragIndexMetadata, type AuditLogEntry,
    // auditLog, // Excluded to avoid conflict with schema-postgres.ts
    type CitationTag, type EvidenceTag, type Jurisdiction, type NewAuditLogEntry, type NewCitationTag, type NewEvidenceTag, type NewRAGIndexMetadata, type RAGIndexMetadata
} from './schema-evidence-crud';

// Phase 80: Chat Messages Schema
export {
    chatMessageRoleEnum, chatMessages,
    chatMetadata, type ChatMessage, type ChatMetadata, type NewChatMessage, type NewChatMetadata
} from './schema-chat';

// Also export additional schema modules as needed
// export * from './schema-route-errors.js';
// export * from './schema-phase78.js';
