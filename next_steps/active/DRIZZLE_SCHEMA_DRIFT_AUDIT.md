# Drizzle Schema Drift — Remediation Plan

**Date**: 2026-04-24
**Target file to fix**: `sveltekit-frontend/data/knowledge/drizzle-schema-reference.md` (last updated 2026-02-16)
**Source of truth**: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`
**Status**: ✅ **COMPLETE** — Reference doc fully regenerated from `SCHEMA_MANIFEST.json` on 2026-04-24. Now manifest-driven (auto-generated); prose sections below are historical context only.

---

## TL;DR — What Needs Fixing

| Category | Drift | Action |
|---|---|---|
| Table count in doc header | "70+" claimed, 131 unique exist | Update to "130+" |
| Missing tables in doc | **68 tables** absent | Add via categorized tables below |
| Missing enums in doc | **19 enums** absent | Add via enum list below |
| Dead schema-file reference | `enhanced-embedding-schema.ts` named — doesn't exist | Remove name |
| Subdirectory list | 16 new files + 8 dead references | Regenerate from `ls schema/` |
| "Last Updated" date | 2026-02-16 | Bump to 2026-04-24 |
| 31 root-level `.ts` schema files | Most undocumented, likely archival candidates | Out of scope — separate audit |

---

## Remediation Step 1 — Header Updates

In the **"Drizzle ORM 0.44 Schema Reference"** file, apply these edits:

### 1a. Update the header metadata

Replace:
```markdown
## Last Updated: February 16, 2026
```

With:
```markdown
## Last Updated: April 24, 2026
```

### 1b. Update the schema files block

Replace the `## Schema Files` section with:

```markdown
## Schema Files

**Main schema**: `src/lib/server/db/schema-postgres.ts` (canonical, 130+ tables, 33 enums)
**Schema barrel**: `src/lib/server/db/schema/index.ts` (re-exports from sub-schemas)
**Chat schema**: `src/lib/server/db/schema-chat.ts` (chatMessages, chatMetadata)
**JSONB schema**: `src/lib/server/db/jsonb-legal-schema.ts` (JSONB-optimized variants, 4 tables)
**Charges schema**: `src/lib/server/db/schema-charges.ts` (charges, caseTimeline — 2 tables)
**GPU cache schema**: `src/lib/server/db/schema-gpu-cache.ts` (shader cache — 6 tables)

### Schema Subdirectory (`schema/` — 33 files)
```
ace-web-crawl.ts, ai_chat.ts, analytics.ts,
case-library-links.ts, cases.ts, citations.ts, codebase-intelligence.ts,
error_brain_analysis.ts, errorBrainDiffs.ts, error_clusters.ts,
error_events.ts, error_feedback.ts, error_suggestions.ts, error_timeline.ts,
evidence.ts, index.ts, ingestion-jobs.ts, jurisdictions.ts,
legal-cases.ts, legal-chunks.ts, legal-citations.ts, legal-definitions.ts,
legal-nodes.ts, legal-relations.ts,
library-document-versions.ts, library-documents.ts,
page-artifacts.ts, persons.ts, reports.ts,
route_error_patches.ts, route_health.ts, route_metadata.ts,
search-analytics.ts, state-constitution-sources.ts
```

### Legacy/Archival Candidates (31 root-level `.ts` schema files)

These exist in `db/` root but most are superseded by `schema-postgres.ts`. Audit pending — do not import without verifying:
```
additional-tables.ts, cases.ts, enhanced-legal-schema.ts, legal-schema.ts,
lucia-schema.ts, schema-actual.ts, schema-canvas.ts, schema-canvas-autosaves.ts,
schema-enhanced.ts, schema-evidence-crud.ts, schema-gpu-metrics.ts,
schema-ingestion.ts, schema-old.ts, schema-pgvector-512.ts,
schema-phase78.ts, schema-phase89-preserved.ts, schema-postgres-enhanced.ts,
schema-prosecutor.ts, schema-sqlite.ts, schema-test-rag.ts,
schema-timeline.ts, schema-unified.ts, schema-web.ts, schema-week3-kb.ts,
schema.ts, unified-schema.ts, unified-schema-clean.ts,
vector-schema.ts, warden-schema.ts
```
```

(The previous doc named `enhanced-embedding-schema.ts` — that file does not exist. Closest matches are `schema-postgres-enhanced.ts` and `enhanced-legal-schema.ts` (barrel, 0 tables). Drop the dead reference.)

---

## Remediation Step 2 — Enums Section

Replace the `## Enums (14 pgEnum types)` section entirely with:

```markdown
## Enums (33 pgEnum types)

```typescript
import { pgEnum } from 'drizzle-orm/pg-core';

// Core auth + case management
userRoleEnum              // 'prosecutor' | 'detective' | 'admin' | 'analyst' | 'paralegal'
caseStatusEnum            // 'open' | 'in_progress' | 'pending_review' | 'closed' | 'archived'
casePriorityEnum          // 'low' | 'medium' | 'high' | 'critical' | 'urgent'
caseRiskLevelEnum         // 'low' | 'medium' | 'high' | 'critical'
caseLinkTypeEnum          // 'CHARGED_UNDER' | 'CITED_IN' | 'RELATED_TO' | 'OVERRULED_BY' | 'AFFIRMED_BY'
caseLinkCategoryEnum      // 'charged_under' | 'cited_authority' | 'defense_authority' | 'court_ruling' | 'related_regulation' | 'constitutional_basis' | 'sentencing_guideline' | 'glossary_concept'

// Evidence + relations
evidenceTypeEnum          // 'document' | 'photo' | 'video' | 'audio' | 'physical' | 'digital' | 'witness_statement' | 'forensic'
relationTypeEnum          // 18 values (supports, contradicts, same_person, timeline, chain_of_custody, ...)
threatLevelEnum           // 'low' | 'medium' | 'high' | 'critical'
verificationStatusEnum    // 'pending' | 'verified' | 'failed' | 'rejected'

// Documents + status
documentStatusEnum        // 'queued' | 'processing' | 'completed' | 'failed'
documentTypeEnum          // 'pleading' | 'motion' | 'brief' | 'contract' | 'evidence' | 'correspondence' | 'court_order' | 'transcript' | 'affidavit' | 'other'
summaryTypeEnum           // 'brief' | 'detailed' | 'executive' | 'technical'
activityStatusEnum        // 'pending' | 'in_progress' | 'completed' | 'cancelled'
reportStatusEnum          // 'draft' | 'pending' | 'completed' | 'published'
processingStatusEnum      // 'queued' | 'extracting' | 'ocr' | 'structuring' | 'chunking' | 'embedding' | 'graphing' | 'complete' | 'failed'

// Legal corpus
authorityLevelEnum        // 'primary' | 'persuasive' | 'secondary' | 'fictional'
corpusTypeEnum            // 'constitution' | 'statute' | 'regulation' | 'bill' | 'case' | 'glossary' | 'treatise' | 'other'
sourceTypeEnum            // 'upload' | 'govinfo' | 'state_official' | 'openstates' | 'lii_reference'
legalNodeTypeEnum         // 'document' | 'title' | 'article' | 'amendment' | 'chapter' | 'part' | 'section' | 'subsection' | 'paragraph' | 'clause' | 'definition' | 'appendix' | 'note'
citationTypeEnum          // 'statutory' | 'constitutional' | 'regulatory' | 'judicial' | 'other'
jurisdictionEnum          // 52 values — 'US-FED' | 'CA' | 'NY' | ... | 'DC' (all US states + federal)

// Fictional cases (3D Prosecutor Simulation)
fictionalCaseCategoryEnum // 'wire_fraud' | 'drug_trafficking' | 'firearms' | 'cybercrime' | 'obstruction' | 'verbal_contracts' | 'tort_federal' | 'federal_employee_liability'
fictionalCaseActorRoleEnum// 'defendant' | 'prosecutor' | 'judge' | 'defense_attorney' | 'witness' | 'victim' | 'agent' | 'expert_witness' | 'informant'

// 3D Courtroom
courtroomAnimTypeEnum     // 'idle' | 'speaking' | 'objection' | 'walk' | 'gesture' | 'point' | 'sit' | 'stand' | 'present_evidence' | 'react_surprised' | 'react_angry' | 'react_sad' | 'nod' | 'shake_head'

// Error brain + suggestions
patchStatusEnum           // 'suggested' | 'applied' | 'rejected'
errorKindEnum             // 'runtime' | 'api' | 'other'
errorSeverityEnum         // 'info' | 'warn' | 'error' | 'critical'
suggestionStateEnum       // 'pending' | 'applied' | 'dismissed' | 'snoozed'
routeHealthStateEnum      // 'healthy' | 'degraded' | 'unhealthy'

// Inference + services
inferenceBackendEnum      // 'ollama' | 'tensorrt' | 'bifrost' | 'litellm' | 'pytorch' | 'onnx'
modelCapabilityEnum       // 'chat' | 'embedding' | 'vlm' | 'code' | 'summarization' | 'rerank'
serviceTierEnum           // 'core' | 'data' | 'inference' | 'future'
```
```

---

## Remediation Step 3 — New Table Sections (68 tables)

Insert these sections alphabetically into the `## Core Tables (schema-postgres.ts)` section. Each block is ready to paste verbatim.

### 3.1 — Canonical Legal Corpus (NEW SECTION)

Add this new section between `### Documents & Legal` and `### Document Processing`:

```markdown
### Canonical Legal Corpus (Authority Chain)
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `canonicalDocuments` | `canonical_documents` | id (uuid), title, docType, citation, sourceUrl, sourceName, licenseTag |
| `canonicalChunks` | `canonical_chunks` | id (uuid), chunkId, documentId → canonicalDocuments, chunkIndex, content, tokenCount, semanticLabel |
| `legalTerms` | `legal_terms` | id (uuid), term, domain, formalDefinition, plainDefinition, relatedChunkIds, metadata |
| `termExamples` | `term_examples` | id (uuid), termId → legalTerms, exampleText, relationship, sourceChunkId |
| `jurisdictions` | `jurisdictions` | id (uuid), code, name, level, parentId |
| `legalNodes` | `legal_nodes` | id (uuid), documentId, versionId, parentNodeId, ordinal, heading, citationLabel |
| `legalChunks` | `legal_chunks` | id (uuid), legalNodeId → legalNodes, chunkIndex, chunkText, tokenCount, pageStart, pageEnd |
| `legalCitations` | `legal_citations` | id (uuid), fromNodeId, toNodeId, citationText, normalizedTarget, confidence |
| `legalDefinitions` | `legal_definitions` | id (uuid), term, normalizedTerm, definedInNodeId → legalNodes, definitionText |
| `legalGlossary` | `legal_glossary` | id (uuid), term, definition, category, jurisdiction, relatedTerms, sources |
| `libraryDocuments` | `library_documents` | id (uuid), jurisdictionId → jurisdictions, title, shortTitle, citation, officialUrl, sourceHash |
| `libraryDocumentVersions` | `library_document_versions` | id (uuid), documentId → libraryDocuments, versionLabel, sourceDate, isCurrent, parentVersionId, diffSummary |
| `caseLibraryLinks` | `case_library_links` | id (uuid), caseId → cases, documentId, nodeId, relevanceScore, citationText, notes |
| `pageArtifacts` | `page_artifacts` | id (uuid), documentId, pageNumber, imageMinioKey, extractedText, ocrText, finalText |
```

### 3.2 — Fictional Cases (NEW SECTION)

Add after the Canonical Legal Corpus section:

```markdown
### Fictional Cases (3D Prosecutor Simulation Phase 3)
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `fictionalCases` | `fictional_cases` | id (uuid), caseId → cases, charge, primaryStatute, defendantName, incidentDate, jurisdictionCity |
| `fictionalCaseActors` | `fictional_case_actors` | id (uuid), fictionalCaseId → fictionalCases, name, description, metadata |
| `fictionalCaseCharges` | `fictional_case_charges` | id (uuid), fictionalCaseId → fictionalCases, chargeName, statute, elements, canonChunkIds, isPrimary |
| `fictionalCaseEvents` | `fictional_case_events` | id (uuid), fictionalCaseId → fictionalCases, eventType, eventDate, description, canonChunkIds, orderIndex |
```

### 3.3 — 3D Courtroom (NEW SECTION)

Add after Fictional Cases:

```markdown
### 3D Courtroom (Phase 6)
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `courtroomModels` | `courtroom_models` | id (uuid), name, role, modelUrl, thumbnailUrl, skeletonType, scaleX |
| `courtroomAnimations` | `courtroom_animations` | id (uuid), name, animationUrl, durationMs, loop, blendWeight, skeletonType |
| `courtroomKeyframes` | `courtroom_keyframes` | id (uuid), sessionId, timeMs, characterRole, animationId → courtroomAnimations, posX, posY |
```

### 3.4 — AST / Codebase Intelligence (NEW SECTION)

Add before or near the existing `### Other` section:

```markdown
### AST / Codebase Intelligence
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `astNodes` | `ast_nodes` | id (uuid), repoId, filePath, symbol, kind, startLine, endLine |
| `astEdges` | `ast_edges` | id (uuid), repoId, sourceNodeId → astNodes, targetNodeId → astNodes, edgeType, metadata |
| `astFileFeatures` | `ast_file_features` | repoId, filePath, language, extension, importCount, exportCount, functionCount |
| `codebaseChunkIndex` | `codebase_chunk_index` | id (uuid), qdrantId, repoId, relativePath, symbol, kind, domain |
| `codebaseAuditReports` | `codebase_audit_reports` | id (uuid), caseId → cases, createdBy, reportType, cudaAvailable, gpuMemoryMb, gpuMemoryFreeMb |
| `clusterSummaries` | `cluster_summaries` | id (uuid), repoId, gpuCluster, summary, purpose, patterns, warnings |
| `clusterNarratives` | `cluster_narratives` | id (uuid), clusterId, k, summary, purpose, patterns, keyFiles |
| `contextBuffers` | `context_buffers` | bufferKey, repoId, content, tokenCount, metadata, expiresAt |
| `ingestionBuffers` | `ingestion_buffers` | id (uuid), scope, clusterId, k, bufferJsonb, tokenEstimate, compressionRatio |
| `enrichmentJobs` | `enrichment_jobs` | jobId (uuid), repoId, jobType, status, cursor, totalProcessed, totalUpserted |
```

### 3.5 — Audio Pipeline (NEW SECTION)

Add as a new section (near existing evidence pipeline):

```markdown
### Audio Pipeline (Whisper CUDA / Sprint 4B)
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `audioTranscripts` | `audio_transcripts` | id (uuid), evidenceId → evidence, caseId → cases, language, duration, fullText, segmentCount |
| `whisperSegments` | `whisper_segments` | id (uuid), transcriptId → audioTranscripts, evidenceId → evidence, segmentIndex, startMs, endMs, text |
```

### 3.6 — Research / Synthesis (NEW SECTION)

Add for P6 research pipeline:

```markdown
### Research & Synthesis
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `researchSummaries` | `research_summaries` | id (uuid), source, pipeline, entityType, query, queryHash, title |
| `userResearchTasks` | `user_research_tasks` | id (uuid), userId → users, sessionId, title, selfPrompt, pipelineHint, priority |
| `knowledgeArtifacts` | `knowledge_artifacts` | id (uuid), sourceType, sourceId, summary, tags, metadata, embedText |
| `synthesisRuns` | `synthesis_runs` | id (uuid), userId → users, query, model, cacheHit, latencyMs, confidence |
| `webSearchIndex` | `web_search_index` | id (uuid), query, clusterId, url, title, content, snippet |
| `ingestionJobs` | `ingestion_jobs` | id (uuid), documentId, status, progress, errorText, metricsJson |
```

### 3.7 — ACE / Context Engine (NEW SECTION)

```markdown
### ACE / Context Engine
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `aceContextCache` | `ace_context_cache` | id (uuid), queryHash, userId → users, policyTier, contextJson, chunkCount, totalTokens |
| `glyphRecords` | `glyph_records` | id (uuid), glyphId, sourceId, caseId → cases, kind, section, schemaVersion |
| `contextTimeline` | `context_timeline` | id (uuid), userId → users, sessionId, eventType, pipeline, summaryId, hyperedgeHash |
```

### 3.8 — Agents / Model Registry (NEW SECTION)

```markdown
### Agents / Model Registry
| Table | DB Name | Key Columns |
|-------|---------|-------------|
| `agentSessions` | `agent_sessions` | id (uuid), sessionId, lane, taskType, status, outcome, metadata |
| `modelRegistry` | `model_registry` | id (uuid), name, version, parameterCount, quantization, contextWindow, embeddingDims |
| `serviceCapabilities` | `service_capabilities` | id (uuid), serviceName, port, healthEndpoint, fallbackService, isRequired, dockerProfile |
| `aiUsageLog` | `ai_usage_log` | id (uuid), userId → users, endpoint, model, promptTokens, completionTokens, totalTokens |
```

### 3.9 — Evidence Extensions (APPEND to existing `### Evidence` section)

Append these rows to the existing Evidence table:

```markdown
| `analysisJobs` | `analysis_jobs` | id (uuid), evidenceId → evidence, caseId → cases, jobType, status, progress, result |
| `evidenceAnalysisCache` | `evidence_analysis_cache` | id (uuid), evidenceId → evidence, caseId → cases, analysisType, result, resultEmbedding, confidence |
| `evidenceAuditLog` | `evidence_audit_log` | id (uuid), evidenceId → evidence, userId → users, action, changes, ipAddress, userAgent |
| `evidenceVersions` | `evidence_versions` | id (uuid), evidenceId → evidence, version, title, description, metadata, changedBy |
| `evidenceEntities` | `evidence_entities` | id (uuid), evidenceId → evidence, caseId → cases, entityText, entityLabel, confidence, startOffset |
| `evidenceForensicFlags` | `evidence_forensic_flags` | id (uuid), evidenceId → evidence, caseId → cases, flagType, description, severity, metadata |
```

### 3.10 — Case Management Extensions (APPEND to existing `### Case Management` section)

```markdown
| `caseNoteVersions` | `case_note_versions` | id (uuid), noteId → caseNotes, title, content, versionNumber, editedBy |
| `caseNoteEvidenceRefs` | `case_note_evidence_refs` | id (uuid), noteId → caseNotes, evidenceId → evidence |
```

### 3.11 — Citations Extensions (APPEND to existing citations area)

```markdown
| `citationTags` | `citation_tags` | id (uuid), citationId → citations, tag, color, createdBy |
| `citationCollections` | `citation_collections` | id (uuid), userId → users, name, description, color, isPublic |
| `collectionCitations` | `collection_citations` | collectionId → citationCollections, citationId → citations (junction table) |
```

### 3.12 — Reports Extensions (APPEND to existing `### Other` section's reports rows)

```markdown
| `reportAuditLog` | `report_audit_log` | id (uuid), reportId → reports, userId → users, action, changes, ipAddress, userAgent |
| `reportVersions` | `report_versions` | id (uuid), reportId → reports, version, title, content, metadata, changedBy |
```

### 3.13 — POI Extensions (APPEND to existing `### Persons of Interest` section)

```markdown
| `poiRelationships` | `poi_relationships` | id (uuid), poiId1 → personsOfInterest, poiId2 → personsOfInterest, relationshipType, strength, metadata |
| `timelineEvents` | `timeline_events` | id (uuid), poiId → personsOfInterest, caseId → cases, title, description, eventDate, eventType |
```

### 3.14 — Chat Extensions (APPEND near existing RAG & Chat section)

```markdown
| `chatDocumentAttachments` | `chat_document_attachments` | id (uuid), chatSessionId, documentId, fileName, fileSize, fileType, minioPath |
```

### 3.15 — Error Brain Extensions (APPEND to existing `### Route Health & Error Tracking` section)

```markdown
| `diagnosisEvents` | `diagnosis_events` | id (uuid), routePath, filePath, query, mode, probableRootCauseType, riskLevel |
```

### 3.16 — Audit / Analytics (APPEND to existing `### Other` section)

```markdown
| `analyticsEvents` | `analytics_events` | id (uuid), eventType, userId → users, sessionId, payload |
| `apiAuditLog` | `api_audit_log` | id (uuid), requestId, method, path, statusCode, durationMs, userId → users |
| `userInteractionHistory` | `user_interaction_history` | id (uuid), userId → users, recommendationId, documentId, caseId, interactionType, durationSeconds |
| `documentTopics` | `document_topics` | id (uuid), documentId → documents, topicId, membershipProbability, centroidDistance |
| `failedJobs` | `failed_jobs` | id (uuid), queue, dlqQueue, reason, retryCount, payload, error |
```

---

## Remediation Step 4 — Optional Follow-ups

### 4a. Column-level audit (MEDIUM effort)
This audit only validated table names and enum names. The doc's "Key Columns" column for the 63 originally-documented tables may have drifted at the column level. A column-level diff would require parsing each `pgTable({ ... })` object body (or using `drizzle-kit introspect` to dump the live DB).

### 4b. Schema file consolidation audit (LARGER effort)
31 `.ts` schema files in `db/` root is excessive. Identify which are imported in production code and archive the rest.

**Candidates for archival** based on name alone (needs import check):
- `schema-old.ts` — clearly legacy
- `schema-actual.ts` — sounds like a past sync point
- `unified-schema-clean.ts` + `unified-schema.ts` — likely superseded
- `schema-postgres-enhanced.ts` — overlap with `schema-postgres.ts`?
- `schema-sqlite.ts` — if project is Postgres-only
- `schema-test-rag.ts` — likely test-only
- `schema-phase78.ts`, `schema-phase89-preserved.ts` — phase artifacts
- `warden-schema.ts`, `lucia-schema.ts` — check if Lucia auth is still in use

**Method**: `rg "from.*\$lib/server/db/<filename>" --type ts --type svelte` for each candidate. Zero results = safe to archive.

### 4c. Automate drift detection (SMALL effort)
Add a script `scripts/tests/audit-schema-drift.mjs` that reuses the extraction commands in the **Method Appendix** below and fails CI if drift exceeds a threshold.

---

## Execution Checklist (Apply Order)

- [ ] **Step 1a**: Update `Last Updated` date to 2026-04-24
- [ ] **Step 1b**: Replace `## Schema Files` block (new counts, real subdirectory, flag archival candidates)
- [ ] **Step 2**: Replace `## Enums (14 pgEnum types)` → `## Enums (33 pgEnum types)` block
- [ ] **Step 3.1**: Add new `### Canonical Legal Corpus` section (14 tables)
- [ ] **Step 3.2**: Add new `### Fictional Cases` section (4 tables)
- [ ] **Step 3.3**: Add new `### 3D Courtroom` section (3 tables)
- [ ] **Step 3.4**: Add new `### AST / Codebase Intelligence` section (10 tables)
- [ ] **Step 3.5**: Add new `### Audio Pipeline` section (2 tables)
- [ ] **Step 3.6**: Add new `### Research & Synthesis` section (6 tables)
- [ ] **Step 3.7**: Add new `### ACE / Context Engine` section (3 tables)
- [ ] **Step 3.8**: Add new `### Agents / Model Registry` section (4 tables)
- [ ] **Step 3.9**: Append 6 rows to existing `### Evidence` section
- [ ] **Step 3.10**: Append 2 rows to existing `### Case Management` section
- [ ] **Step 3.11**: Append 3 rows for citations extensions
- [ ] **Step 3.12**: Append 2 rows for reports extensions
- [ ] **Step 3.13**: Append 2 rows to `### Persons of Interest` section
- [ ] **Step 3.14**: Append 1 row for chat extensions
- [ ] **Step 3.15**: Append 1 row to `### Route Health & Error Tracking` section
- [ ] **Step 3.16**: Append 5 rows for audit/analytics in `### Other` section

**Total**: 68 table rows + 19 enum additions + header fixes.

---

## Method Appendix (reproducible)

```bash
SCHEMA="sveltekit-frontend/src/lib/server/db/schema-postgres.ts"
DOC="sveltekit-frontend/data/knowledge/drizzle-schema-reference.md"

# Real enum names (sorted)
grep -E "^export const \w+Enum = pgEnum\(" $SCHEMA \
  | sed 's/export const //;s/ = pgEnum.*//' | sort -u > /tmp/real-enums.txt

# Real table names (sorted)
grep -E "^export const [a-zA-Z]+ = pgTable\(" $SCHEMA \
  | sed 's/export const //;s/ = pgTable.*//' | sort -u > /tmp/real-tables.txt

# Doc-claimed tables
grep -E "^\| \`[a-zA-Z]+\`" $DOC | awk -F'`' '{print $2}' | sort -u > /tmp/claimed-tables.txt

# Drift report
echo "=== Tables missing from doc ==="
comm -23 /tmp/real-tables.txt /tmp/claimed-tables.txt
echo "=== Tables in doc but not in schema-postgres.ts ==="
comm -13 /tmp/real-tables.txt /tmp/claimed-tables.txt

# Per-table line-number lookup (for follow-up column audits)
for t in $(comm -23 /tmp/real-tables.txt /tmp/claimed-tables.txt); do
  line=$(grep -n "^export const $t = pgTable" $SCHEMA | head -1 | cut -d: -f1)
  echo "$t:$line"
done
```

**Audit baseline** (for regression check):
- Real tables in `schema-postgres.ts`: **131 unique names**
- Real enums in `schema-postgres.ts`: **33**
- Doc-documented tables (as of 2026-02-16): **73** (71 in schema-postgres.ts + 2 routed to schema-chat.ts)
- Doc-documented enums: **14**
- **Missing from doc**: 68 tables, 19 enums
