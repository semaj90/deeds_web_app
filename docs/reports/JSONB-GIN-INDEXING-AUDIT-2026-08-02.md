# JSONB / GIN Indexing Audit — 2026-08-02

Scope: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` only (148-table Drizzle-declared schema). DB-only tables (`atlas_packets`, `atlas_codebase_packets`, `route_runtime_packets`, `tool_registry`, etc.) are out of scope — they already carry extensive manual GIN coverage (`drizzle/manual/0024_*`, `0035_*`, `0043_*`, `0999_*`) and are not declared in this file.

## Rule of thumb

JSONB is the storage type; GIN is an index type for searching *inside* JSONB. `jsonb_ops` (default) supports containment (`@>`), key-exists (`?`,`?|`,`?&`); `jsonb_path_ops` supports only `@>`/jsonpath but is smaller/faster. **GIN only helps `@>`/`?` containment queries — it does NOT accelerate `col->>'key' = value` equality lookups**, which need a plain B-tree **expression** index on the extracted text instead. If a JSONB column is only ever written/read whole, leave it unindexed.

## Findings summary

- 178 JSONB columns found across 146 tables in `schema-postgres.ts`.
- **9** already GIN-indexed via existing migrations (no action).
- **4** have real `->>'key' = value` query evidence but **no** matching index → recommend expression **B-tree**.
- **1** has GIN `jsonb_path_ops` present but the actual query pattern is key-equality, not containment → GIN doesn't help; recommend supplemental B-tree.
- **164** show no containment/key-exists/equality-extraction usage in `src/lib/server/**` or `scripts/atlas/**` → leave unindexed.
- Hot scalar fields (`source_ref`, `packet_key`, `workspace_revision`, `page_rank_score`) are already B-tree indexed everywhere they appear in this file except `page_rank_score` (read-only display field, never filtered — no index needed) and two dead columns (`tokenArtifacts.sourceRef`, `unknownResolutionLedger.promotedPacketKey`) with zero query call sites — no action recommended for either since there's no evidence of filtering.

## Already covered (no action)

| Column | Evidence | Index | Recommendation |
|---|---|---|---|
| `evidence.metadata` | `drizzle/manual` migration `012_gin_jsonb_indexes.sql` | GIN jsonb_path_ops | none — covered |
| `evidence.tags` | same migration; **also** `0000_stiff_the_hood.sql` declares GIN `jsonb_ops` on same column | GIN (dual opclass declared — reconcile) | drop the `jsonb_ops` copy, keep `jsonb_path_ops` unless `?`/`?|` key-exists queries are found later |
| `evidence.ai_tags` | migration 012 | GIN jsonb_path_ops | none — covered |
| `cases.metadata` | migration 012; also `0000_stiff_the_hood.sql` GIN `jsonb_ops` | GIN (dual, same note as above) | reconcile opclass, otherwise covered |
| `legalDocuments.metadata` | migration 012 (`jsonb_path_ops`); sidecar `db/schema/legal-documents.ts` declares GIN `jsonb_ops` on same column | GIN (dual/duplicate) | reconcile — two schema files independently declaring different opclasses on the same column is a drift risk, not a new-index need |
| `criminals.aiTags` | migration 012 | GIN jsonb_path_ops | none — covered |
| `codebaseChunkIndex.tags` | `drizzle/manual/0013_codeintel_indexes.sql`, `0016_codeintel_schema.sql` | GIN jsonb_path_ops | none — covered |
| `codebaseChunkIndex.metadata` | same manual migrations | GIN jsonb_path_ops | see below — query pattern mismatch |
| `clusterSummaries.tags` | manual `0013`/`0016` | GIN jsonb_ops | none — covered |

## GIN present but query pattern is equality, not containment → add B-tree

| Column | Query evidence | Current index | Recommendation | Reasoning |
|---|---|---|---|---|
| `codebaseChunkIndex.metadata` | `hydrate-candidates.ts:63` — `metadata->>'packet_key'`; `retrieve-candidates.ts:419` — `metadata->>'tree_node_id'` | GIN jsonb_path_ops (containment only) | add `B-tree` on `(metadata->>'packet_key')` | GIN jsonb_path_ops never accelerates `->>'x' = y`; this is a hot join-key lookup, not a containment query |

## No index present, real equality-extraction usage found → add B-tree expression index

| Column | Query evidence | Current index | Recommendation | Reasoning |
|---|---|---|---|---|
| `aceContextCache.contextJson` | `ace/context-cache-registry.ts:98` — `context_json->>'contextHash' = ${contextHash}` | none | B-tree on `(context_json->>'contextHash')` | exact-match cache key lookup, not containment |
| `contextTimeline.payload` | `cache/timeline-builder-unified.ts:87` — `payload->>'caseId'` equality filter | none | B-tree on `(payload->>'caseId')` | equality filter used to build per-case timelines |
| `codebaseChunkIndex.outputMeta` | `retrieve-candidates.ts:419` — `output_meta->>'tree_node_id'` | none | B-tree on `(output_meta->>'tree_node_id')` | equality filter, not containment |
| `analyticsEvents.payload` *or* `panelActivityLog.payload`(table unconfirmed) | `trpc/routers/analytics.ts:39` — `payload->>'traceId' = ${traceId}` | none | **needs live verification** — table not conclusively identified from static import trace; if confirmed, B-tree on `(payload->>'traceId')` | equality filter on trace correlation id |

## Bulk sweep — remaining 164 JSONB columns (no containment/key-exists/equality-extraction usage found)

No `@>`, `?`, `?|`, `?&`, `jsonb_path_ops`/`jsonb_ops`, or `col->>'k' = v` usage found in `src/lib/server/**/*.ts` or `scripts/atlas/**/*.mjs` for any of the following. Rule of thumb says: **leave unindexed**. Grouped by table for scan-ability (write-and-read-whole envelope/metadata columns):

- `users`/`sessions`/`emailVerificationCodes`/`passwordResetTokens`: none
- `criminals`: `aliases`, `fingerprints`
- `evidence`: `chainOfCustody`, `canvasPosition`, `aiAnalysis`, `entities`, `keywords`
- `analysisJobs.result`
- `intentSynthesis`: `authority`, `sourceRefs`, `chunkIds`, `summaryIds`, `retrievalTrace`, `cachedSteps`
- `scenarioCache`: `qdrantPointIds`, `contextChunks`, `cachedResult`
- `agentMemoryObservations`: `tags`, `sourceRefs`, `toolCalls`, `rawJson`
- `loraTrainingRuns`: `metricsJson`, `configJson`
- `documents.metadata`
- `vectorMetadata.metadata`
- `caseScores`: `breakdown`, `criteria`, `recommendations`
- `userAiQueries.contextUsed`
- `vectorOutbox.payload`, `vectorJobs.result`
- `canvasStates.stateData`, `canvasAnnotations.annotationData`
- `aiReports.metadata`
- `codebaseAuditReports`: `graphAnalysis`, `evidenceAnalysis`, `codebaseAnalysis`
- `agentSessions.metadata`
- `citations.tags`
- `reports.metadata`, `reportAuditLog.changes`, `reportVersions.metadata`
- `themes.config`
- `personsOfInterest`: `aiProfile`, `who`, `what`, `why`, `how`, `risk`, `profileData`, `tags`, `position`, `metadata`
- `poiPhotos`: `aiTags`, `exifData`, `forensicData` (note: `forensicData`/`aiTags` on `poi_photos` already covered by migration 012 — see "Already covered")
- `poiRelationships.metadata`
- `timelineEvents`: `metadata`, `evidenceIds`, `personIds`, `locationIds`
- `evidenceAnalysisCache`: `result`, `tags`
- `legalAnalysisSessions.inputData`
- `legalGlossary`: `relatedTerms`, `sources`
- `legalResearch.results`
- `documentProcessing.metadata`, `documentChunks.metadata`, `documentSummaries.metadata`
- `ldrResearchTasks.sourceCounts`, `ldrResearchResults.metadata`
- `ldrSynthesis`: `keyFindings`, `metadata`
- `mlRankingCache.topKResults`
- `mlClustering.centroidsJson`
- `deepResearchAuditLog.details`
- `yorhaCases.metadata`
- `yorhaEvidenceNodes`: `ai_tags`, `key_entities` (already covered by migration 012 — see "Already covered")
- `chatDocumentAttachments.metadata`
- `yorhaChatMessages.referenced_evidence`
- `routeErrorPatches`: `metadata` ×2 occurrences
- `diagnosisEvents`: `likelyFiles`, `impactedFiles`, `fixPlan`, `evidence`, `rankedFiles`, `suggestedTests`, `sources`, `stages`
- `caseReports.citations`
- `auditLog.details`
- `userInteractionHistory`: `topicPreferences`, `metadata`
- `evidenceAuditLog.changes`
- `evidenceVersions.metadata`
- `evidenceForensicFlags.metadata`
- `failedJobs.payload`
- `legalNodes.tagsJson`
- `ingestionJobs.metricsJson`
- `aiUsageLog.metadata`
- `canonicalDocuments.metadata`
- `canonicalChunks`: `domains`, `keyTerms`, `metadata`
- `legalTerms`: `relatedChunkIds`, `metadata`
- `termExamples.metadata`
- `fictionalCases.metadata`
- `fictionalCaseCharges`: `elements`, `canonChunkIds`, `metadata`
- `fictionalCaseActors.metadata`
- `fictionalCaseEvents`: `canonChunkIds`, `metadata`
- `modelRegistry.metadata`
- `serviceCapabilities.metadata`
- `audioTranscripts.metadata`
- `whisperSegments.metadata`
- `llmContextCache`: `contextPackJson`, `chunkIds`, `graphPaths`, `toolPolicy`
- `knowledgeArtifacts`: `tags`, `metadata`
- `synthesisRuns.citations`
- `glyphRecords`: `tags`, `entities`, `kagNeighbors`, `dagPrev`, `dagNext`, `topology`, `render`, `recordJson`
- `ingestionBuffers.bufferJsonb`
- `clusterNarratives`: `patterns`, `keyFiles`, `warnings`, `crossReferences`, `tags`
- `researchSummaries.outputMeta`
- `userResearchTasks.result`
- `codeRelations.evidence`
- `courtroomModels.metadata`, `courtroomAnimations.metadata`, `courtroomKeyframes.metadata`
- `codebaseChunkIndex`: `clusterSummary`, `neo4jMeta` (metadata/outputMeta handled above)
- `clusterSummaries.metadata`
- `clusterCards.sourceRefs`
- `communityReports.metadata`
- `hypergraphEdges`: `metadata`, `error`
- `enrichmentJobs.metadata`
- `contextBuffers.metadata`
- `astNodes.metadata`, `astEdges.metadata`
- `astFileFeatures.outputMeta`
- `codeLlmIndex.metadata` (n.b. `code_llm_index.output_meta` — a different column, declared in sidecar `schema-ace.ts` — already has GIN `jsonb_path_ops`; not in this file's scope)
- `featureLexicalFacts.metadata`
- `featureDomainFacts`: `domainProbabilities`, `evidence`
- `featureStructuralFacts.metadata`
- `featureOntologyTuples`: `objectValue`, `evidence`
- `featurePacketBindings.evidence`
- `panelActivityLog` (n/a — no jsonb column found at that offset besides scalar fields)
- `rgSearchRuns`: `args`, `diagnostics`
- `rgSearchHits`: `scores`, `entities` (already GIN via manual `2026-05-11_rg_atlas_tables.sql` — move to "Already covered" if verified live)
- `llmSynthesisEvents`: `acePacket`, `toolCalls`, `sourceRefs`, `cacheKeys`, `routingHints`, `validation`
- `policyRerankerMetadata`: `metadata`, `inferenceStats`
- `deepResearchReports`: `citations`, `recommendations`, `metadata` (citations/recommendations already GIN via `0050_deep_research_reports.sql`/`0051_deep_research_reports_gin_indexes.sql` — move to "Already covered" if verified live)
- `agentRuns.state`
- `agentRunActions.inputPacket`
- `agentActionResults`: `outputPacket`, `errorDetail`
- `workflowEvents.payload`, `outboxEvents.payload`
- `tokenArtifacts.metadata`
- `unknownPackets.evidencePayload`
- `unknownResolutionLedger.evidenceSummary`

Two entries above (`rgSearchHits.scores`/`.entities`, `deepResearchReports.citations`/`.recommendations`) already have GIN indexes declared in manual migrations — flagged here only because the containment/key-exists grep didn't surface a live query call site referencing them by name in `src/lib/server` (the writes are likely the only current consumers). Treat as **already covered, no action** — do not re-index.

## Applied — 2026-08-02

The 5 concrete B-tree expression indexes below were applied live via `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (verified in `pg_indexes` post-apply). The `analyticsEvents`/`panelActivityLog` row above was **not** applied — table identity unconfirmed, no live verification done. The opclass reconciliation (evidence.tags, cases.metadata, legal_documents.metadata) was **not** applied — needs a live index-list check before any DROP, per the note below.

```sql
-- Fixes GIN/equality mismatch on the hottest join-key lookup in the retrieval path
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_metadata_packet_key
  ON codebase_chunk_index ((metadata->>'packet_key'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_metadata_tree_node_id
  ON codebase_chunk_index ((metadata->>'tree_node_id'));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_index_output_meta_tree_node_id
  ON codebase_chunk_index ((output_meta->>'tree_node_id'));

-- ACE context cache: exact-match lookup by contextHash
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ace_context_cache_context_hash
  ON ace_context_cache ((context_json->>'contextHash'));

-- Context timeline: per-case filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_context_timeline_payload_case_id
  ON context_timeline ((payload->>'caseId'));

-- Opclass reconciliation (evidence.tags, cases.metadata, legal_documents.metadata each have
-- a jsonb_ops copy from an older migration AND a jsonb_path_ops copy from migration 012 /
-- sidecar schema files). Verify live index list before dropping either — do NOT run blind:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('evidence','cases','legal_documents');
-- If both exist and only containment (@>) queries are used, drop the jsonb_ops copy:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_evidence_tags;          -- jsonb_ops copy, keep jsonb_path_ops version
-- DROP INDEX CONCURRENTLY IF EXISTS idx_cases_metadata;         -- jsonb_ops copy, keep jsonb_path_ops version
-- DROP INDEX CONCURRENTLY IF EXISTS idx_legal_documents_metadata; -- jsonb_ops copy, keep jsonb_path_ops version
```
