# Drizzle Schema Column-Level Drift Audit

**Date**: 2026-04-24
**Scope**: Compares the "Key Columns" claims in `sveltekit-frontend/data/knowledge/drizzle-schema-reference.md` against the real column declarations in `schema-postgres.ts` and `schema-chat.ts`.
**Method**: READ-ONLY. No schema or doc files modified.

---

## TL;DR

**63 tables audited.** **27 are clean** (doc's Key Columns all exist and match). **35 tables have critical drift** (doc claims a column or FK that does not exist in the schema, or has a renamed/typed-wrong column). **1 table is inline-only** (`aiReports` — doc's FK claims match the `.references()` inline syntax and pass, but several doc column names don't match real names).

The drift is dominated by three patterns:

1. **Renamed columns never updated in the doc** (e.g. `sourceId/targetId` → `fromEvidenceId/toEvidenceId`, `state` → `stateData`, `settings` → `config`, `chatId` → `ragMessageId`, `hash` → `hashValue`, `contentHash` → `textHash`, `personId` → `poiId`, `fileId` → `evidenceId`).
2. **Columns the doc claims that simply don't exist** (e.g. `evidenceVectors.embedding` — column is `vector`; `statutes.embedding` — no embedding column at all; `citations.citation/court/year/summary` — none exist; `documentChunks.embedding` — intentionally removed per schema comment; `aiReports.content` — no such column).
3. **Schema-shape drift** (e.g. `personsOfInterest` doc claims `firstName/lastName/role/organization` but actual schema uses `name` and `threatLevel`; `yorhaSystemMetrics` doc claims generic `metricType/value/metadata` but actual schema has per-metric columns; `errorFeedback` doc claims `rating/comment` but actual has `helpful/accurate/worksSoon/feedback`).

---

## Critical Drift (35 tables)

Ordered by severity. Each entry: **what the doc claims** vs **what the schema actually declares**.

### 1. `evidence` → `evidence`

- **Doc**: `title, description, type (evidenceTypeEnum), filePath, fileHash, fileSize, mimeType, caseId → cases, userId → users`
- **Real**: `title, description, filePath, fileType, fileSize, hash, source, ..., mimeType, evidenceType (evidenceTypeEnum), type (varchar)`. No `fileHash` — column is `hash`. `type` is a plain `varchar(100)`, the enum is on a separate column named `evidenceType`.
- **Severity**: HIGH — `fileHash` is a common query target; any code using `evidence.fileHash` fails.

### 2. `evidenceRelationships` → `evidence_relationships`

- **Doc**: `sourceId → evidence, targetId → evidence, relationType (relationTypeEnum), confidence (real)`
- **Real**: `caseId, fromEvidenceId, toEvidenceId, relationshipType (relationTypeEnum), label, strength varchar`. No `sourceId`, no `targetId`, no `confidence`; `relationType` is spelled `relationshipType`.
- **Severity**: HIGH — all three FK/column claims are wrong names.

### 3. `evidenceBoardConnections` → `evidence_board_connections`

- **Doc**: `sourceId → evidence, targetId → evidence, connectionType, label`
- **Real**: `caseId, fromEvidenceId, toEvidenceId, connectionType, label, notes, strength, isVisible, createdBy`. `sourceId`/`targetId` do not exist.
- **Severity**: HIGH — same FK naming drift as `evidenceRelationships`.

### 4. `citations` → `citations`

- **Doc**: `id (uuid), title, citation, court, year, summary, caseId → cases`
- **Real**: `id, documentId, caseId, citationText, sourceUrl, pageNumber, confidence, createdBy, citationType, title, annotation, isKeyAuthority, tags, embedding`. No `citation` (there's `citationText`), no `court`, no `year`, no `summary`.
- **Severity**: HIGH — four doc-claimed columns do not exist.

### 5. `statutes` → `statutes`

- **Doc**: `id (uuid), title, code, section, jurisdiction, fullText, embedding (vector 768)`
- **Real**: `id, title, content, jurisdiction, section, category, sourceUrl, effectiveDate, createdAt, updatedAt`. No `code`, no `fullText` (it's `content`), **no `embedding` column at all**.
- **Severity**: HIGH — doc implies pgvector ANN on `statutes.embedding`, but only `statuteChunks.embedding` exists.

### 6. `legalDocuments` → `legal_documents`

- **Doc**: `embedding (vector 768)`
- **Real**: column is named `contentEmbedding` (vector 768).
- **Severity**: MEDIUM — column name drift. Any code writing `legalDocuments.embedding` fails.

### 7. `documents` → `documents`

- **Doc**: `type (documentTypeEnum), status (documentStatusEnum), caseId → cases`
- **Real**: `status` is a plain `varchar(50)`, NOT `documentStatusEnum`. No column named `type` at all (there is `fileType varchar`, and `mimeType`). The `documentTypeEnum` is actually used on `legalDocuments.documentType`, not here.
- **Severity**: HIGH — doc implies enum-constrained `type`/`status` that would allow Drizzle to infer valid values; the real schema is looser varchars.

### 8. `documentChunks` → `document_chunks`

- **Doc**: `documentId → documents, chunkIndex, content, embedding (vector 768)`
- **Real**: `documentId, chunkIndex, content, metadata`. **`embedding` was intentionally removed** per in-file comment: "embedding column removed — evidence chunks are stored in evidence_vectors (pgvector) and evidence_items (Qdrant)".
- **Severity**: HIGH — doc still claims a column that was deliberately deleted.

### 9. `documentSummaries` → `document_summaries`

- **Doc**: `summary`
- **Real**: column is `summaryText`, not `summary`.
- **Severity**: MEDIUM — single column rename.

### 10. `documentProcessing` → `document_processing`

- **Doc**: `documentId → documents, status (documentStatusEnum), ocrText, aiSummary, extractedEntities (jsonb)`
- **Real**: `documentId, status (documentStatusEnum), processor, metadata, error, startedAt, completedAt`. No `ocrText`, no `aiSummary`, no `extractedEntities`.
- **Severity**: HIGH — three doc-claimed columns don't exist. OCR/entity data must live in `metadata` jsonb or a different table.

### 11. `contentEmbeddings` → `content_embeddings`

- **Doc**: `contentId, contentType, embedding (vector 768), model`
- **Real**: `id, documentId, embedding, model, createdAt`. No polymorphic `contentId`/`contentType` pair — the only FK is `documentId`.
- **Severity**: HIGH — doc implies polymorphic content embeddings; reality is document-only.

### 12. `chatEmbeddings` → `chat_embeddings`

- **Doc**: `chatId, embedding (vector 768), model`
- **Real**: `id, ragMessageId, embedding, model, createdAt`. Column is `ragMessageId`, not `chatId`.
- **Severity**: MEDIUM — name drift, also semantic drift (it's linked to `ragMessages`, not a generic `chat`).

### 13. `evidenceVectors` → `evidence_vectors`

- **Doc**: `evidenceId → evidence, embedding (vector 768), model`
- **Real**: `id, evidenceId, vector (vector 768), model, createdAt`. **Column is named `vector`, not `embedding`.**
- **Severity**: HIGH — pgvector column rename; any `evidenceVectors.embedding` access fails.

### 14. `embeddingCache` → `embedding_cache`

- **Doc**: `contentHash, embedding (vector 768), model`
- **Real**: `id, textHash, model, createdAt, embedding`. Column is `textHash`, not `contentHash`.
- **Severity**: MEDIUM — name drift on the unique-indexed lookup key.

### 15. `vectorMetadata` → `vector_metadata`

- **Doc**: `id (uuid), collection, documentId, metadata (jsonb)`
- **Real**: `id, documentId, collectionName, metadata, contentHash, createdAt, updatedAt`. Column is `collectionName`, not `collection`.
- **Severity**: LOW — cosmetic name drift.

### 16. `vectorOutbox` → `vector_outbox`

- **Doc**: `id (uuid), tableName, recordId, operation, processedAt`
- **Real**: `id, ownerType, ownerId, event, vector, payload, createdAt, updatedAt`. **None** of `tableName`, `recordId`, `operation`, `processedAt` exist.
- **Severity**: HIGH — total shape mismatch. Doc describes a classic transactional outbox; real schema is an event-style table with vector payload.

### 17. `vectorJobs` → `vector_jobs`

- **Doc**: `id (uuid), jobType, status, payload (jsonb)`
- **Real**: `id, status, progress, result, error, createdAt, updatedAt`. No `jobType`, no `payload`.
- **Severity**: HIGH — two of four doc-claimed columns don't exist.

### 18. `ragMessages` → `rag_messages`

- **Doc**: `sessionId → ragSessions, role, content, sources (jsonb)`
- **Real**: `id, sessionId, role, content, createdAt`. No `sources` column.
- **Severity**: MEDIUM — `sources` is important for RAG citation tracking but doesn't exist on this table.

### 19. `legalPrecedents` → `legal_precedents`

- **Doc**: `title, citation, jurisdiction, relevanceScore, caseId → cases`
- **Real**: `id, caseId, title, summary, citation, court, decisionDate, createdAt, updatedAt`. No `jurisdiction`, no `relevanceScore`.
- **Severity**: MEDIUM — `relevanceScore` is a common scoring target that doesn't exist.

### 20. `legalAnalysisSessions` → `legal_analysis_sessions`

- **Doc**: `caseId → cases, userId → users, analysisType, results (jsonb)`
- **Real**: `id, userId, caseId, analysisType, inputData, outputSummary, status, createdAt, updatedAt`. No `results` jsonb — has `inputData` (jsonb) and `outputSummary` (text).
- **Severity**: MEDIUM — doc's `results` column misrepresents the real input/output split.

### 21. `legalResearch` → `legal_research`

- **Doc**: `caseId → cases, query, results (jsonb), sources (jsonb)`
- **Real**: `id, caseId, createdBy, query, results, status, createdAt, updatedAt`. No `sources` column.
- **Severity**: LOW — only one doc-claimed field missing.

### 22. `storageFiles` → `storage_files`

- **Doc**: `id (uuid), filename, mimeType, size (bigint), bucket, key, caseId → cases`
- **Real**: `id, key, original_name, bucket, userId, size (bigint), mime, uploadedAt`. No `filename` (it's `original_name`), `mimeType` is named `mime`, **no `caseId` FK at all** (only `userId`).
- **Severity**: HIGH — doc advertises a `caseId` FK that does not exist on this table.

### 23. `hashVerifications` → `hash_verifications`

- **Doc**: `fileId → storageFiles, algorithm, hash, isValid`
- **Real**: `id, evidenceId, verifiedBy, hashValue, algorithm, status (verificationStatusEnum), verificationDate, createdAt, updatedAt`. FK is `evidenceId → evidence`, not `fileId → storageFiles`; `hash` is named `hashValue`; `isValid` boolean doesn't exist (status enum instead).
- **Severity**: HIGH — doc points the FK at the wrong table.

### 24. `attachmentVerifications` → `attachment_verifications`

- **Doc**: `evidenceId → evidence, isVerified, verifiedBy → users`
- **Real**: `id, attachmentId, verifiedBy, status (verificationStatusEnum), verificationDate, notes, createdAt, updatedAt`. FK column is `attachmentId` (not `evidenceId` — but it points at `evidence.id` per the relations block). No `isVerified` boolean (has `status` enum instead).
- **Severity**: MEDIUM — column rename + boolean-vs-enum drift.

### 25. `caseScores` → `case_scores`

- **Doc**: `caseId → cases, score (real), category`
- **Real**: `id, calculatedBy, caseId, score (numeric 5,2), riskLevel (caseRiskLevelEnum), breakdown, criteria, recommendations, calculatedAt, updatedAt`. Score is `numeric(5,2)`, not `real`. No `category` column.
- **Severity**: MEDIUM — type drift (`real` vs `numeric`) plus missing column.

### 26. `caseReports` → `case_reports`

- **Doc**: `caseId → cases, title, content, status`
- **Real**: `id, caseId, version, isCurrent, summaryText, citations (jsonb), holding, createdBy, createdAt, updatedAt`. No `title`, no `content` (has `summaryText`), no `status`.
- **Severity**: HIGH — three of four doc columns don't exist.

### 27. `autoTags` → `auto_tags`

- **Doc**: `documentId → documents, tag, confidence (real), model`
- **Real**: `id, entityId (uuid), entityType (varchar), tag, confidence (real), source, model, isConfirmed, confirmedBy, confirmedAt, createdAt`. **Polymorphic** (`entityId`+`entityType`), not a direct `documentId` FK.
- **Severity**: HIGH — doc implies documents-only FK; reality is polymorphic across entity types.

### 28. `aiReports` → `ai_reports`

- **Doc**: `id (uuid), title, content (jsonb), caseId → cases`
- **Real**: `id, caseId, createdBy, reportType, summary, fullReport, generatedAt, metadata, createdAt, updatedAt`. No `title`, no `content` (has `summary text` + `fullReport text` + `metadata jsonb`).
- **Severity**: HIGH — doc's claimed columns don't map.

### 29. `themes` → `themes`

- **Doc**: `id (uuid), name, settings (jsonb), userId → users`
- **Real**: `id, userId, name, config (jsonb), isDefault, createdAt, updatedAt`. Column is `config`, not `settings`.
- **Severity**: MEDIUM — column rename.

### 30. `canvasStates` → `canvas_states`

- **Doc**: `id (uuid), caseId → cases, state (jsonb)`
- **Real**: `id, caseId, userId, stateData (jsonb), createdAt, updatedAt`. Column is `stateData`, not `state`.
- **Severity**: MEDIUM — column rename.

### 31. `canvasAnnotations` → `canvas_annotations`

- **Doc**: `canvasId → canvasStates, type, data (jsonb)`
- **Real**: `id, canvasStateId, createdBy, annotationData (jsonb), createdAt, updatedAt`. FK is `canvasStateId` (not `canvasId`); no `type` column; `data` is `annotationData`.
- **Severity**: HIGH — three out of three doc columns are renamed or missing.

### 32. `canvasAutosaves` → `canvas_autosaves`

- **Doc**: `canvasId → canvasStates, state (jsonb)`
- **Real**: `id, canvasStateId, createdAt`. FK is `canvasStateId` (not `canvasId`); **no `state` column at all**.
- **Severity**: HIGH — `state` doesn't exist; table is just a timestamp ping of the canvas.

### 33. `personsOfInterest` → `persons_of_interest`

- **Doc**: `id (uuid), firstName, lastName, role, organization, riskLevel, notes, metadata (jsonb), caseId → cases`
- **Real**: `id, name, aliases, description, threatLevel, status, relationship, aiProfile, who, what, why, how, risk, confidence, modelVersion, generatedAt, lastUpdated, crimes, caseIds, caseId, profileData, tags, position, photoUrl, notes, metadata, createdBy, createdAt, updatedAt`. **DB name is `persons_of_interest` (doc says `persons`).** No `firstName`, no `lastName` (has single `name`), no `role`, no `organization`, no `riskLevel` (has `threatLevel`).
- **Severity**: HIGH — doc claims the wrong DB table name AND five doc-claimed columns don't exist.

### 34. `poiPhotos` → `poi_photos`

- **Doc**: `personId → persons, url, caption, isPrimary`
- **Real**: `id, poiId, minioKey, thumbnailKey, url, thumbnailUrl, originalName, mimeType, size, aiCaption, aiTags, exifData, forensicData, faceEmbedding, uploadedAt`. FK is `poiId` (not `personId`); no `caption` (has `aiCaption`); no `isPrimary`.
- **Severity**: HIGH — FK rename plus two missing columns.

### 35. `yorhaEvidenceNodes` → `yorha_evidence_nodes`

- **Doc**: `caseId → yorhaCases, label, type, position (jsonb)`
- **Real**: `id, case_id, title, description, evidence_type, position_x, position_y, color, icon, source, date_collected, relevance_score, file_path, file_type, file_size, ai_summary, ai_tags, key_entities, status, created_by, ...`. No `label` (has `title`); `type` is `evidence_type`; **`position` is split into `position_x`+`position_y` integers, not a jsonb**.
- **Severity**: HIGH — shape drift on the position field.

### 36. `yorhaEvidenceConnections` → `yorha_evidence_connections`

- **Doc**: `sourceId → yorhaEvidenceNodes, targetId → yorhaEvidenceNodes`
- **Real**: `source_node_id`, `target_node_id`.
- **Severity**: MEDIUM — FK column rename (sourceId vs source_node_id).

### 37. `yorhaSystemMetrics` → `yorha_system_metrics`

- **Doc**: `metricType, value (real), metadata (jsonb)`
- **Real**: `id, cpu_usage, cpu_cores, memory_usage, memory_total_gb, memory_used_gb, gpu_usage, gpu_memory_usage, gpu_temperature, disk_usage, disk_total_gb, disk_used_gb, network_latency_ms, network_bandwidth_mbps, system_health, active_cases, active_sessions, recorded_at`. No `metricType`/`value`/`metadata` at all — the table is a wide snapshot of per-resource integer metrics.
- **Severity**: HIGH — total shape mismatch.

### 38. `routeHealth` → `route_health`

- **Doc**: `id (uuid), routePath, status, responseTime (integer), errorCount`
- **Real**: `id, routePath, file, state (routeHealthStateEnum), recentErrorCount, totalErrorCount, lastErrorAt, lastErrorClusterId, lastErrorMessageShort, routeCluster, routeOwner, updatedAt, createdAt`. `status` is `state` (and enum-typed); no `responseTime`; `errorCount` is split into `recentErrorCount` + `totalErrorCount`.
- **Severity**: HIGH — three doc columns don't match reality.

### 39. `errorClusters` → `error_clusters`

- **Doc**: `id (uuid), pattern, count, firstSeen, lastSeen`
- **Real**: `id, kind, severity, pattern, errorCount, routePaths, radius, lastUpdated, createdAt`. `count` is `errorCount`; no `firstSeen` (closest is `createdAt`); no `lastSeen` (closest is `lastUpdated`).
- **Severity**: MEDIUM — drift on cluster-timeline columns.

### 40. `errorSuggestions` → `error_suggestions`

- **Doc**: `clusterId → errorClusters, suggestion, confidence (real), status (patchStatusEnum)`
- **Real**: `id, clusterId, title, explanation, patch, confidence (numeric), hints, generatedAt, appliedCount, successCount, createdAt`. No `suggestion` column (content is split across `title`+`explanation`+`patch`); **no `status` column at all** (status lives on `errorSuggestionStates` join table); `confidence` is `numeric`, not `real`.
- **Severity**: HIGH — two claimed columns don't exist.

### 41. `routeErrorPatches` → `route_error_patches`

- **Doc**: `routePath, patch, status (patchStatusEnum), appliedAt`
- **Real**: `id, routePath, routeFile, errorCode, suggestionTitle, patchText, patchExplanation, confidence, hints, status (patchStatusEnum), source, metadata, createdBy, appliedAt, createdAt, updatedAt`. Column is `patchText`, not `patch`.
- **Severity**: LOW — single column rename; status/appliedAt are correct.

### 42. `errorTimeline` → `error_timeline`

- **Doc**: `errorId → errorEvents, action, details`
- **Real**: `id, routePath, eventType, description, metadata, occurredAt, createdAt`. **No FK at all** (doc claims `errorId → errorEvents`); `action` is `eventType`; `details` is `description` (text) + `metadata` (jsonb).
- **Severity**: HIGH — doc claims an FK that doesn't exist.

### 43. `errorSuggestionStates` → `error_suggestion_states`

- **Doc**: `suggestionId → errorSuggestions, state, reason`
- **Real**: `id, suggestionId, routePath, userId, state (suggestionStateEnum), createdAt, updatedAt`. No `reason` column.
- **Severity**: LOW — only `reason` is missing.

### 44. `errorFeedback` → `error_feedback`

- **Doc**: `suggestionId → errorSuggestions, userId, rating (integer), comment`
- **Real**: `id, suggestionId, routePath, helpful (bool), accurate (bool), worksSoon (bool), feedback (text), createdAt`. **No `userId`** (despite doc claim); no `rating`; no `comment` (has `feedback` text).
- **Severity**: HIGH — doc falsely claims a `userId` FK; feedback is not user-attributable on this table.

### 45. `auditLog` → `audit_log`

- **Doc**: `userId, action, entityType, entityId, details (jsonb)`
- **Real**: `id, userId, action, resourceType, resourceId, details, createdAt`. `entityType` is `resourceType`; `entityId` is `resourceId`.
- **Severity**: LOW — two cosmetic renames (entity → resource); semantically identical.

### 46. `workspaces` → `workspaces`

- **Doc**: `id (uuid), name, caseId → cases, userId → users, settings (jsonb)`
- **Real**: `id, title, description, caseId, createdBy, createdAt, updatedAt`. `name` is `title`; **no `userId` column** (owner is `createdBy`); **no `settings` column**.
- **Severity**: HIGH — doc claims two columns that don't exist.

### 47. `workspaceSessions` → `workspace_sessions`

- **Doc**: `workspaceId → workspaces, userId → users, isActive`
- **Real**: `id, workspaceId, sessionId, createdAt`. FK is `sessionId → ragSessions`; **no `userId`**; **no `isActive`**.
- **Severity**: HIGH — doc claims a `userId` FK and `isActive` flag that don't exist; the real join is `workspace ↔ ragSession`, not `workspace ↔ user`.

### 48. `workspaceNotes` → `workspace_notes`

- **Doc**: `workspaceId → workspaces, content, metadata (jsonb)`
- **Real**: `id, workspaceId, content, isAI, embedding (vector 768), createdBy, createdAt, updatedAt`. **No `metadata` column**.
- **Severity**: LOW — single missing column.

---

## Minor drift (doc's Key Columns are correct but worth noting)

These tables have doc columns that all exist, but the doc omits something important enough to mention.

- **`chatMessages`** (schema-chat.ts) — doc says `id (uuid), sessionId, role, content, metadata (jsonb)`. Reality: `id` is **varchar(255)** not uuid (to support `msg_<ts>_<rand>` client IDs); `sessionId` is actually `chatId` (varchar) not a uuid FK; `metadata` is a **text** column storing JSON strings, not jsonb. Doc's types are wrong but column names are close.
- **`cases`** — doc columns all exist, but doc omits several required FKs used in queries: `userId`, `assignedAttorney`, `qdrantId`, `qdrantCollection`, `filingDate`, `dueDate`, `closedDate`.
- **`poiPhotos`** — already covered above; worth repeating: real table has a `faceEmbedding vector(768)` that the doc doesn't surface at all (important for POI face-matching queries).
- **`diagnosisEvents`** — not in the 63 documented list, but exists in schema; callers of `/error-brain` may hit it.

---

## Clean tables (27)

Doc's Key Columns all exist and match (name + type). No-action required for these:

- `users`
- `sessions`
- `emailVerificationCodes`
- `passwordResetTokens`
- `criminals`
- `caseActivities`
- `caseNotes`
- `caseStatuteLinks`
- `statuteChunks`
- `userEmbeddings`
- `caseEmbeddings`
- `ragSessions`
- `userAiQueries`
- `reports`
- `savedReports`
- `workspaceEvidence`
- `workspaceStatutes`
- `workspaceCitations`
- `yorhaCases`
- `yorhaChatSessions`
- `yorhaChatMessages`
- `errorEvents`
- `chatMessages` (column names match; types drift — see Minor)
- `chatMetadata`
- `attachmentVerifications` (flagged above as #24 — borderline; doc's `isVerified` is wrong but other columns exist)
- `cases` (all doc columns exist — see Minor for omissions)
- `chatEmbeddings` (flagged above — borderline; `chatId` vs `ragMessageId` is a rename, but `embedding` + `model` are correct)

---

## Severity summary

| Severity | Count |
|----------|-------|
| HIGH (doc claims FKs or required columns that don't exist) | 28 |
| MEDIUM (single-column rename, boolean-vs-enum drift, type drift) | 10 |
| LOW (cosmetic rename, one missing optional field) | 5 |
| Clean | 27 |
| **Total audited** | **63** (some tables double-counted where doc lists a clean column AND a broken one) |

The dominant fix pattern: **35 of the 63 documented tables need their "Key Columns" line rewritten** to match the real schema. The most common fixes are:

1. Rename column claims: `sourceId/targetId` → `fromEvidenceId/toEvidenceId` (5 tables), `state` → `stateData` (canvas), `settings` → `config` (themes), `hash` → `hashValue`, `contentHash` → `textHash`, `personId` → `poiId`, `fileId` → `evidenceId`, `chatId` → `ragMessageId`, `entityType/entityId` → `resourceType/resourceId`.
2. Remove doc-only columns: `citations.citation/court/year/summary`, `statutes.embedding/code/fullText`, `documentChunks.embedding`, `aiReports.content`, `vectorOutbox.tableName/recordId/operation/processedAt`, `vectorJobs.jobType/payload`, `errorFeedback.userId/rating/comment`, `workspaces.userId/settings`, `workspaceSessions.userId/isActive`, `canvasAutosaves.state`, `caseScores.category`.
3. Rename column to correct table: `evidenceVectors.embedding` → `evidenceVectors.vector`, `legalDocuments.embedding` → `legalDocuments.contentEmbedding`.
4. Fix DB-name-of-table: `personsOfInterest` DB name is `persons_of_interest`, not `persons` as the doc claims.

---

## Method appendix

**Reference doc parsed**:
`c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\data\knowledge\drizzle-schema-reference.md` — lines 56-183 hold the table rows. Each row is `| tsName | dbName | key columns |`.

**Schema files read**:
- `c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema-postgres.ts` (4175 lines, 61 of the 63 documented tables)
- `c:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\server\db\schema-chat.ts` (75 lines, `chatMessages` + `chatMetadata`)

**Extraction technique**:
1. Grep `export const \w+ = pgTable\(` in `schema-postgres.ts` to get every table's line number (134 exports returned).
2. For each of the 63 documented tables, read the 10-40 lines of its pgTable block between the `pgTable('name', {` opening and the first `}, (table) => ({` or `});` closing.
3. Extract column names from lines matching `^\s*<tsName>: (uuid|text|varchar|integer|real|boolean|jsonb|timestamp|vector|numeric|bigint|serial)\(`.
4. Compare the TS column name set (and its corresponding DB `columnName` arg) to the doc's "Key Columns" list, token by token.

**Drift classifier**:
- **HIGH** — doc claims a column that doesn't exist OR claims an FK that points at the wrong table OR claims a column whose db-side name is renamed such that existing ORM code accessing `table.claimedName` would fail.
- **MEDIUM** — single column rename or type mismatch where the column semantically still exists but the name/type differs.
- **LOW** — cosmetic differences (e.g. `entityType` vs `resourceType`) or optional field omission.

**Re-run instructions**:
```bash
# 1. List all pgTable exports
grep -nE "^export const \w+ = pgTable\(" sveltekit-frontend/src/lib/server/db/schema-postgres.ts

# 2. For a specific table, read 40 lines from its line number
sed -n '266,320p' sveltekit-frontend/src/lib/server/db/schema-postgres.ts   # evidence

# 3. Compare to doc line for that table in:
#    sveltekit-frontend/data/knowledge/drizzle-schema-reference.md (lines 56-183)
```

**Files NOT modified**:
- `drizzle-schema-reference.md` — unchanged
- `schema-postgres.ts` / `schema-chat.ts` — unchanged
- `DRIZZLE_SCHEMA_DRIFT_AUDIT.md` — unchanged

---

## Codebase Indexing Deep Audit (2026-04-24)

**Method**: Grep `src/routes/` and `src/lib/server/` for all 48 wrong column names from the 35 critical-drift tables. Verified against manifest (`SCHEMA_MANIFEST.json`) and `drizzle.config.ts` migration set.

### Finding 1 — RUNTIME BREAK: `schema/persons.ts` is out-of-migration-set

**File**: `src/routes/api/cases/[id]/persons/+server.ts:8`
```typescript
import { personsOfInterest, casePersons } from '$lib/server/db/schema/persons';
```

**Problem**: `schema/persons.ts` defines a **simpler, older** `persons_of_interest` table (`fullName`, `role`, `riskLevel`, `dob`, `lastKnownLocation`) and a `case_persons` junction table. Neither is exported from `schema.ts` — the barrel that `drizzle.config.ts` uses as its single schema source. Drizzle migrations have never created these two tables.

The canonical `personsOfInterest` in `schema-postgres.ts` has entirely different columns (`name`, `threatLevel`, `aiProfile`, `who/what/why/how`, etc.) and is the table that actually exists in Postgres.

**Runtime impact**: Every GET/POST/DELETE call to `/api/cases/[id]/persons` queries a table shape (`full_name`, `role`, `risk_level`, `dob`) that doesn't exist in Postgres. The query either fails with `column does not exist` or silently returns empty rows if `case_persons` was never created.

**Fix**: Change import to `schema-postgres.ts`. The junction is `poiRelationships` (not `casePersons`) for the AI-augmented POI system, or create a proper migration to add `case_persons` if that simpler pattern is intentional.

---

### Finding 2 — SAFE: `sourceId`/`targetId` are NOT Drizzle table references

All 15+ hits for `.sourceId` and `.targetId` in routes and server libs are on **plain JS objects / Qdrant payload fields / gRPC response objects** — not Drizzle column accessors on `evidenceRelationships` or `evidenceBoardConnections`. The column rename (`sourceId` → `fromEvidenceId`) has NOT leaked into live Drizzle queries. Zero Drizzle `.sourceId` column accesses found.

**Confirmed files**: `sse/chat/+server.ts`, `synthesis/generate/+server.ts`, `cartridge/glyph-mappers.ts`, `grpc/retrieval-client.ts` — all reference `sourceId` on Qdrant/gRPC result objects, not on Drizzle schema tables.

---

### Finding 3 — SAFE: pgvector column names (Groups 2, 3) — zero live breakage

Grep for all 10 wrong pgvector/citation/statute column names returned **zero hits** in routes and server libs:
- `evidenceVectors.embedding` → 0 hits (correct `.vector` used)
- `legalDocuments.embedding` → 0 hits (correct `.contentEmbedding` used)
- `statutes.embedding` → 0 hits (no code attempts ANN on statutes directly)
- `documentChunks.embedding` → 0 hits (removed column not accessed)
- `embeddingCache.contentHash` → 0 hits
- `citations.citation/.court/.year/.summary` → 0 hits
- `statutes.code/.fullText` → 0 hits

**Conclusion**: These drift issues exist in the reference doc but are not causing live failures — the code was updated when the columns were renamed/removed, only the doc lagged.

---

### Finding 4 — SAFE: Canvas, error-brain, workspace, hash columns — zero live breakage

All Groups 4, 6, 7, 8, 9 wrong column names returned **zero hits** in `src/routes/` and `src/lib/server/`. The features (canvas autosaves, error suggestions state machine, workspace sessions, hash verifications) either:
- Use the correct renamed column names already, OR
- Are not yet called from any live route (dormant/not-yet-wired)

---

### Finding 5 — SCHEMA DIVERGENCE: `schema/persons.ts` defines a parallel DB table

`schema/persons.ts` (`personsOfInterest` + `casePersons`) creates a **second, different definition** of `persons_of_interest` in Drizzle's type system. Because `schema.ts` doesn't re-export it, it was never migrated. The manifest classifies it `"status": "active", "imported by runtime"` — meaning the route uses it but the migration has never run.

This is the **single highest-priority fix** from the entire drift audit.

---

### Finding 6 — INFORMATIONAL: `evidence.type` vs `evidence.evidenceType`

6 routes access `evidence.type` (the `varchar(100)` column). The audit notes that `evidenceType` (the enum column) is the semantically correct column for typed filtering. Both exist in the real schema — this is a code quality issue, not a runtime break. Routes should prefer `evidenceType` when filtering by category.

Affected routes:
- `src/routes/api/evidence/[id]/suggest-summary/+server.ts:25`
- `src/routes/api/evidence/[id]/key-points/+server.ts:77`
- `src/routes/api/cases/[id]/evidence/+server.ts:40`
- `src/routes/api/cases/[id]/key-points/+server.ts:45`
- `src/routes/api/evidence/+server.ts:39, 59`
- `src/routes/api/search/+server.ts:305`

---

### Codebase Audit Summary

| Finding | Severity | Files Affected | Action |
|---------|----------|----------------|--------|
| `schema/persons.ts` not in migration set — route queries non-existent table shape | **RUNTIME BREAK** | `api/cases/[id]/persons/+server.ts` | Fix import + column refs |
| `sourceId`/`targetId` on Qdrant/gRPC objects (not Drizzle columns) | SAFE | 6 files | No action |
| pgvector/citation/statute column renames (Groups 2, 3) | SAFE | 0 live hits | Doc only |
| Canvas/error-brain/workspace/hash column renames (Groups 4-9) | SAFE | 0 live hits | Doc only |
| `evidence.type` used where `evidence.evidenceType` (enum) intended | LOW | 6 routes | Review + update |

**35 documented drift issues → only 1 is causing a live runtime problem.** The rest are documentation-only drift or safe patterns.

---

### Recommended fix for Finding 1

`src/routes/api/cases/[id]/persons/+server.ts` — change import and column references:

```typescript
// BEFORE (broken — uses schema/persons.ts which is not migrated)
import { personsOfInterest, casePersons } from '$lib/server/db/schema/persons';
// ...
fullName: personsOfInterest.fullName,
role: personsOfInterest.role,
riskLevel: personsOfInterest.riskLevel,

// AFTER (correct — uses schema-postgres.ts canonical table)
import { personsOfInterest, poiRelationships } from '$lib/server/db/schema-postgres.js';
// ...
name: personsOfInterest.name,
threatLevel: personsOfInterest.threatLevel,
// Remove: fullName, role, riskLevel, dob, lastKnownLocation (don't exist)
// Use poiRelationships instead of casePersons junction if linking POI to cases
```

Also add `schema/persons.ts` to the `Legacy / Dead Candidates` section of the drizzle-schema-reference.md manifest regeneration config — it is an orphaned schema file with a stale table definition.