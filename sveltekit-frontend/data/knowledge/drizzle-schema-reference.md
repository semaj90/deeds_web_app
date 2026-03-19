# Drizzle ORM 0.44 Schema Reference

## Last Updated: February 16, 2026

---

## Schema Files

**Main schema**: `src/lib/server/db/schema-postgres.ts` (canonical, 70+ tables)
**Schema barrel**: `src/lib/server/db/schema/index.ts` (re-exports from sub-schemas)
**Chat schema**: `src/lib/server/db/schema-chat.ts` (chatMessages, chatMetadata)
**JSONB schema**: `src/lib/server/db/jsonb-legal-schema.ts` (JSONB-optimized variants)
**Charges schema**: `src/lib/server/db/schema-charges.ts` (charges, caseTimeline)
**GPU cache schema**: `src/lib/server/db/schema-gpu-cache.ts` (shader cache)
**Enhanced embedding**: `src/lib/server/db/enhanced-embedding-schema.ts`

### Schema Subdirectory (`schema/`)
```
citations.ts, evidence.ts, legal-cases.ts, persons.ts, reports.ts,
ai_chat.ts, error_clusters.ts, error_events.ts, error_feedback.ts,
error_suggestions.ts, error_timeline.ts, route_error_patches.ts,
route_health.ts, route_metadata.ts, error_brain_analysis.ts,
errorBrainDiffs.ts, ace-web-crawl.ts, gpu-cache-schema.ts,
legal-index.ts, legal-laws.ts, poi.ts, precedent-graph.ts,
user-management.ts, userIntent.ts, cases.ts
```

---

## Enums (14 pgEnum types)

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

userRoleEnum        // 'prosecutor' | 'detective' | 'admin' | 'analyst' | 'paralegal'
caseStatusEnum      // 'open' | 'in_progress' | 'pending_review' | 'closed' | 'archived'
casePriorityEnum    // 'low' | 'medium' | 'high' | 'critical' | 'urgent'
evidenceTypeEnum    // 'document' | 'photo' | 'video' | 'audio' | 'physical' | 'digital' | 'witness_statement' | 'forensic'
relationTypeEnum    // 'supports' | 'contradicts' | 'same_person' | 'timeline' | 'chain_of_custody' | ... (18 values)
threatLevelEnum     // 'low' | 'medium' | 'high' | 'critical'
patchStatusEnum     // 'suggested' | 'applied' | 'rejected'
documentStatusEnum  // 'queued' | 'processing' | 'completed' | 'failed'
documentTypeEnum    // 'pleading' | 'motion' | 'brief' | 'contract' | 'evidence' | 'correspondence' | 'court_order' | 'transcript' | 'affidavit' | 'other'
summaryTypeEnum     // 'brief' | 'detailed' | 'executive' | 'technical'
activityStatusEnum  // 'pending' | 'in_progress' | 'completed' | 'cancelled'
verificationStatusEnum // 'pending' | 'verified' | 'failed' | 'rejected'
reportStatusEnum    // 'draft' | 'pending' | 'completed' | 'published'
caseRiskLevelEnum   // 'low' | 'medium' | 'high' | 'critical'
```

---

## Core Tables (schema-postgres.ts)

### Auth & Users
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `users` | `users` | id (uuid), email, passwordHash, firstName, lastName, role (userRoleEnum), isActive |
| `sessions` | `sessions` | id (text PK), userId → users, expiresAt |
| `emailVerificationCodes` | `email_verification_codes` | userId → users, code, expiresAt |
| `passwordResetTokens` | `password_reset_tokens` | tokenHash (PK), userId → users |

### Case Management
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `cases` | `cases` | id (uuid), title, caseNumber, status (caseStatusEnum), priority (casePriorityEnum), jurisdiction, court, clientName, opposingParty, metadata (jsonb) |
| `caseActivities` | `case_activities` | caseId → cases, type, description, status (activityStatusEnum) |
| `caseNotes` | `case_notes` | caseId → cases, userId → users, title, content (text), metadata (jsonb) |
| `caseStatuteLinks` | `case_statute_links` | caseId → cases, statuteId → statutes (junction table) |
| `caseScores` | `case_scores` | caseId → cases, score (real), category |
| `caseReports` | `case_reports` | caseId → cases, title, content, status |

### Criminal Records
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `criminals` | `criminals` | id (uuid), firstName, lastName, dateOfBirth, nationalId, threatLevel (threatLevelEnum), caseId → cases |

### Evidence
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `evidence` | `evidence` | id (uuid), title, description, type (evidenceTypeEnum), filePath, fileHash, fileSize, mimeType, caseId → cases, userId → users |
| `evidenceRelationships` | `evidence_relationships` | sourceId → evidence, targetId → evidence, relationType (relationTypeEnum), confidence (real) |
| `evidenceBoardConnections` | `evidence_board_connections` | sourceId → evidence, targetId → evidence, connectionType, label |

### Documents & Legal
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `documents` | `documents` | id (uuid), title, content, filePath, type (documentTypeEnum), status (documentStatusEnum), caseId → cases |
| `legalDocuments` | `legal_documents` | id (uuid), title, content, embedding (vector 768), metadata (jsonb), documentType, jurisdiction |
| `citations` | `citations` | id (uuid), title, citation, court, year, summary, caseId → cases |
| `statutes` | `statutes` | id (uuid), title, code, section, jurisdiction, fullText, embedding (vector 768) |
| `statuteChunks` | `statute_chunks` | statuteId → statutes, chunkIndex, content, embedding (vector 768) |
| `legalPrecedents` | `legal_precedents` | title, citation, jurisdiction, relevanceScore, caseId → cases |
| `legalAnalysisSessions` | `legal_analysis_sessions` | caseId → cases, userId → users, analysisType, results (jsonb) |
| `legalResearch` | `legal_research` | caseId → cases, query, results (jsonb), sources (jsonb) |

### Document Processing
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `documentProcessing` | `document_processing` | documentId → documents, status (documentStatusEnum), ocrText, aiSummary, extractedEntities (jsonb) |
| `documentChunks` | `document_chunks` | documentId → documents, chunkIndex, content, embedding (vector 768) |
| `documentSummaries` | `document_summaries` | documentId → documents, summaryType (summaryTypeEnum), summary |

### Embeddings & Vectors
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `contentEmbeddings` | `content_embeddings` | contentId, contentType, embedding (vector 768), model |
| `userEmbeddings` | `user_embeddings` | userId → users, embedding (vector 768), model |
| `chatEmbeddings` | `chat_embeddings` | chatId, embedding (vector 768), model |
| `evidenceVectors` | `evidence_vectors` | evidenceId → evidence, embedding (vector 768), model |
| `caseEmbeddings` | `case_embeddings` | caseId → cases, embedding (vector 768), model |
| `embeddingCache` | `embedding_cache` | contentHash, embedding (vector 768), model |
| `vectorMetadata` | `vector_metadata` | id (uuid), collection, documentId, metadata (jsonb) |
| `vectorOutbox` | `vector_outbox` | id (uuid), tableName, recordId, operation, processedAt |
| `vectorJobs` | `vector_jobs` | id (uuid), jobType, status, payload (jsonb) |

### RAG & Chat
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `ragSessions` | `rag_sessions` | id (uuid), userId → users, title, metadata (jsonb) |
| `ragMessages` | `rag_messages` | sessionId → ragSessions, role, content, sources (jsonb) |
| `chatMessages` | `chat_messages` | id (uuid), sessionId, role, content, metadata (jsonb) |
| `chatMetadata` | `chat_metadata` | sessionId, model, totalTokens |
| `userAiQueries` | `user_ai_queries` | userId → users, query, response, model, tokensUsed |

### Persons of Interest
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `personsOfInterest` | `persons` | id (uuid), firstName, lastName, role, organization, riskLevel, notes, metadata (jsonb), caseId → cases |
| `poiPhotos` | `poi_photos` | personId → persons, url, caption, isPrimary |

### Storage & Files
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `storageFiles` | `storage_files` | id (uuid), filename, mimeType, size (bigint), bucket, key, caseId → cases |
| `hashVerifications` | `hash_verifications` | fileId → storageFiles, algorithm, hash, isValid |

### Workspaces
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `workspaces` | `workspaces` | id (uuid), name, caseId → cases, userId → users, settings (jsonb) |
| `workspaceSessions` | `workspace_sessions` | workspaceId → workspaces, userId → users, isActive |
| `workspaceEvidence` | `workspace_evidence` | workspaceId → workspaces, evidenceId → evidence |
| `workspaceStatutes` | `workspace_statutes` | workspaceId → workspaces, statuteId → statutes |
| `workspaceNotes` | `workspace_notes` | workspaceId → workspaces, content, metadata (jsonb) |
| `workspaceCitations` | `workspace_citations` | workspaceId → workspaces, citationId → citations |

### YoRHa Theme
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `yorhaCases` | `yorha_cases` | id (uuid), title, status, metadata (jsonb) |
| `yorhaEvidenceNodes` | `yorha_evidence_nodes` | caseId → yorhaCases, label, type, position (jsonb) |
| `yorhaEvidenceConnections` | `yorha_evidence_connections` | sourceId → yorhaEvidenceNodes, targetId → yorhaEvidenceNodes |
| `yorhaChatSessions` | `yorha_chat_sessions` | caseId → yorhaCases, userId, title |
| `yorhaChatMessages` | `yorha_chat_messages` | sessionId → yorhaChatSessions, role, content |
| `yorhaSystemMetrics` | `yorha_system_metrics` | metricType, value (real), metadata (jsonb) |

### Route Health & Error Tracking
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `routeHealth` | `route_health` | id (uuid), routePath, status, responseTime (integer), errorCount |
| `errorEvents` | `error_events` | id (uuid), routePath, message, stack, severity, metadata (jsonb) |
| `errorClusters` | `error_clusters` | id (uuid), pattern, count, firstSeen, lastSeen |
| `errorSuggestions` | `error_suggestions` | clusterId → errorClusters, suggestion, confidence (real), status (patchStatusEnum) |
| `routeErrorPatches` | `route_error_patches` | routePath, patch, status (patchStatusEnum), appliedAt |
| `errorTimeline` | `error_timeline` | errorId → errorEvents, action, details |
| `errorSuggestionStates` | `error_suggestion_states` | suggestionId → errorSuggestions, state, reason |
| `errorFeedback` | `error_feedback` | suggestionId → errorSuggestions, userId, rating (integer), comment |

### Other
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `autoTags` | `auto_tags` | documentId → documents, tag, confidence (real), model |
| `aiReports` | `ai_reports` | id (uuid), title, content (jsonb), caseId → cases |
| `reports` | `reports` | id (uuid), title, content, caseId → cases, status (reportStatusEnum) |
| `savedReports` | `saved_reports` | reportId → reports, userId → users, savedAt |
| `themes` | `themes` | id (uuid), name, settings (jsonb), userId → users |
| `canvasStates` | `canvas_states` | id (uuid), caseId → cases, state (jsonb) |
| `canvasAnnotations` | `canvas_annotations` | canvasId → canvasStates, type, data (jsonb) |
| `canvasAutosaves` | `canvas_autosaves` | canvasId → canvasStates, state (jsonb) |
| `attachmentVerifications` | `attachment_verifications` | evidenceId → evidence, isVerified, verifiedBy → users |
| `auditLog` | `audit_log` | userId, action, entityType, entityId, details (jsonb) |

---

## Type Inference Patterns

```typescript
// Drizzle 0.44 — use $inferSelect / $inferInsert
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

// Convention: Select = read, Insert = write (Insert omits defaults/auto-generated)
```

---

## Import Patterns

```typescript
// Table + enum imports
import { users, cases, evidence, caseStatusEnum } from '$lib/server/db/schema-postgres.js';

// Type imports
import type { User, NewUser } from '$lib/server/db/schema-postgres.js';

// Drizzle query utilities
import { eq, and, or, desc, asc, sql, like, inArray } from 'drizzle-orm';

// Column type imports
import { pgTable, uuid, text, varchar, timestamp, jsonb, integer, boolean, real, serial, bigint, numeric, index, unique, foreignKey } from 'drizzle-orm/pg-core';

// Relations
import { relations } from 'drizzle-orm/relations';

// IMPORTANT: Use .js extension (bundler resolves .js → .ts)
import { cases } from '$lib/server/db/schema-postgres.js'; // ✅
import { cases } from '$lib/server/db/schema-postgres.ts';  // ❌
```

---

## Common Query Patterns

```typescript
import { db } from '$lib/server/db/client.js';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { eq, desc, and } from 'drizzle-orm';

// Select with where
const result = await db.select().from(cases).where(eq(cases.status, 'open'));

// Select with relations (Drizzle relational queries)
const caseWithEvidence = await db.query.cases.findFirst({
  where: eq(cases.id, caseId),
  with: { evidence: true }
});

// Insert
const [newCase] = await db.insert(cases).values({ title, status: 'open', priority: 'medium' }).returning();

// Update
await db.update(cases).set({ status: 'closed' }).where(eq(cases.id, caseId));

// Delete
await db.delete(evidence).where(eq(evidence.id, evidenceId));

// Pagination
const result = await db.select().from(cases)
  .orderBy(desc(cases.createdAt))
  .limit(20)
  .offset(0);
```

---

## Indexes (Key Ones)

```typescript
// Cases: composite indexes for common queries
index('idx_cases_created_at').on(table.createdAt)
index('idx_cases_status_priority').on(table.status, table.priority)
index('idx_cases_status_priority_created').on(table.status, table.priority, table.createdAt)

// Vector indexes (HNSW for pgvector)
index('idx_legal_docs_embedding_hnsw').using('hnsw', table.embedding.op('vector_cosine_ops'))

// JSONB indexes (GIN for metadata)
index('idx_legal_docs_metadata_gin').using('gin', table.metadata)
```

---

## Route Map

### App Routes (23 — under `src/routes/(app)/`)
| Route | Purpose |
|-------|---------|
| `/active-cases` | Active case list |
| `/admin/*` | Admin tools (dev-tools, knowledge-search, codebase-viewer, etc.) |
| `/agentic-errors` | Agentic error analysis |
| `/ai-dashboard` | AI model dashboard |
| `/all-routes` | SSE real-time route health monitoring |
| `/analysis-center` | Analysis tools hub |
| `/ast-topology` | AST topology visualization |
| `/cases` | Case management (CRUD, board, overview, details) |
| `/citations` | Citation management |
| `/codebase-index` | Codebase indexing tools |
| `/command-center` | Error command center |
| `/dashboard` | Main dashboard |
| `/error-brain` | Error brain analysis |
| `/evidence` | Evidence management |
| `/evidence-library` | Evidence library browser |
| `/global-search` | Global search across entities |
| `/gpu-evidence-graph` | GPU-accelerated evidence graph |
| `/persons-of-interest` | POI management |
| `/phase78` | Phase 78 error analysis |
| `/system-configuration` | System settings |
| `/terminal` | Terminal interface |

### API Routes (43 — under `src/routes/api/`)
| Route | Purpose |
|-------|---------|
| `/api/auth/*` | Authentication (login, register, logout) |
| `/api/cases/*` | Case CRUD + linking |
| `/api/chat/*` | Chat/LLM streaming |
| `/api/citations/*` | Citation management |
| `/api/evidence/*` | Evidence CRUD + analysis |
| `/api/health/*` | Health checks (database, neo4j) |
| `/api/indexing/*` | Codebase indexing to Qdrant + MinIO |
| `/api/kb/*` | Knowledge base CRUD (CouchDB) |
| `/api/knowledge/*` | Knowledge search (Qdrant) |
| `/api/ollama/*` | Ollama model proxy |
| `/api/persons/*` | POI management |
| `/api/rag/*` | RAG pipeline (search, validate, answer) |
| `/api/reports/*` | Report generation |
| `/api/routes/*` | Route health SSE |
| `/api/sse/*` | Server-Sent Events |
| `/api/summarize/*` | Document summarization |
| `/api/embed` | Embedding generation |
| `/api/stream` | Streaming responses |
| `/api/topology/*` | Network topology |
| `/api/tools/*` | Tool registry |
| Other | ace, acp, admin, analyze-file, analyze-tag, codebase, codebase-index, generate-cluster-summaries, ingest, llm-improvement, phase72-90, ping, pipeline, qlora, rabbitmq, retrieve, security, synthesize, system |
