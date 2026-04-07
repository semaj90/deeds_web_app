# UUID Validation Audit — Drizzle API Routes

## Status: COMPLETE (78 UUID + 11 non-UUID routes validated)

**Problem**: Dynamic API routes passed `params.id` directly to Drizzle `eq()` / raw SQL without validation. PostgreSQL rejects non-UUID values for uuid columns, causing unhandled 500 errors.

**Shared Utility**: `src/lib/server/validation.ts`
- `isUuid(s)` — type-guard UUID regex check
- `validateUuidParams(params, ...keys)` — returns 400 Response or null
- `isValidRouteId(s)` — route path format (varchar, max 500 chars)
- `isValidSafeId(s)` — alphanumeric/hyphen IDs (max 255 chars)
- `isValidFilePath(s)` — file paths (no traversal, no null bytes, max 1000 chars)
- `isValidCitation(s)` — citation text (max 500 chars)

**Playwright Tests**: `tests/uuid-validation-audit.spec.ts` — **54/54 PASS**

---

## All Fixed UUID Routes (78)

### Cases Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/cases/[id]` | id | GET/PATCH/DELETE | `isUuid()` (pre-existing) |
| `/api/cases/[id]/analyze/stream` | id | POST | `isUuid()` |
| `/api/cases/[id]/canvas` | id | GET/POST | `isUuid()` |
| `/api/cases/[id]/chat` | id | POST | `isUuid()` |
| `/api/cases/[id]/citations` | id | GET/POST | `isUuid()` |
| `/api/cases/[id]/evidence` | id | GET/DELETE | `isUuid()` |
| `/api/cases/[id]/export/pdf` | id | POST | `isUuid()` |
| `/api/cases/[id]/key-points` | id | GET | `isUuid()` |
| `/api/cases/[id]/laws` | id | GET | `isUuid()` |
| `/api/cases/[id]/notes` | id | GET/POST | `UUID_RE` (pre-existing) |
| `/api/cases/[id]/notes/[noteId]` | id, noteId | GET/PATCH/DELETE | `validateUuidParams()` |
| `/api/cases/[id]/notes/[noteId]/evidence` | id, noteId | GET | `validateUuidParams()` |
| `/api/cases/[id]/notes/[noteId]/versions` | id, noteId | GET/POST | `validateUuidParams()` |
| `/api/cases/[id]/notes/search` | id | POST | `isUuid()` |
| `/api/cases/[id]/overview` | id | GET | `isUuid()` |
| `/api/cases/[id]/reasoning-chain` | id | GET | `isUuid()` |
| `/api/cases/[id]/similar` | id | GET | `isUuid()` |
| `/api/cases/[id]/timeline` | id | GET | `isUuid()` |

### Evidence Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/evidence/[id]/approve` | id | POST | `isUuid()` |
| `/api/evidence/[id]/audit` | id | GET | `isUuid()` |
| `/api/evidence/[id]/chain-of-custody` | id | GET | `isUuid()` |
| `/api/evidence/[id]/gpu-analysis` | id | POST | `isUuid()` |
| `/api/evidence/[id]/key-points` | id | GET/POST | `isUuid()` |
| `/api/evidence/[id]/report` | id | GET | `isUuid()` |
| `/api/evidence/[id]/suggest-summary` | id | POST | `isUuid()` |
| `/api/evidence/[id]/versions` | id | GET/POST | `isUuid()` |
| `/api/evidence/[docId]/status` | docId | GET | `isUuid()` |

### POI Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/persons-of-interest/[id]` | id | GET/PATCH/DELETE | `z.string().uuid()` (pre-existing) |
| `/api/persons-of-interest/[id]/associates` | id | GET/POST | `isUuid()` |
| `/api/persons-of-interest/[id]/associates/[associateId]` | id, associateId | DELETE | `validateUuidParams()` |
| `/api/persons-of-interest/[id]/face-match` | id | POST | `isUuid()` |
| `/api/persons-of-interest/[id]/photos` | id | GET/POST | `isUuid()` |
| `/api/persons-of-interest/[id]/risk` | id | GET | `isUuid()` |
| `/api/persons-of-interest/[id]/similar` | id | GET | `isUuid()` |
| `/api/persons-of-interest/[id]/summary` | id | GET | `isUuid()` |

### Citations Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/citations/[citationId]/tags` | citationId | GET/POST/DELETE | `isUuid()` |
| `/api/citations/collections/[collectionId]` | collectionId | GET/PUT/DELETE | `isUuid()` |
| `/api/citations/collections/[collectionId]/citations` | collectionId | GET/POST | `isUuid()` |
| `/api/citations/collections/[collectionId]/export` | collectionId | GET | `isUuid()` |

### Library Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/library/document/[id]` | id | GET | `isUuid()` |
| `/api/library/document/[id]/node/[nodeId]` | id, nodeId | GET/POST/DELETE | `validateUuidParams()` |
| `/api/library/document/[id]/toc` | id | GET | `isUuid()` |
| `/api/library/documents/[documentId]` | documentId | GET/PUT/DELETE | `isUuid()` |
| `/api/library/documents/[documentId]/chunks` | documentId | GET | `isUuid()` |
| `/api/library/documents/[documentId]/pdf` | documentId | GET | `isUuid()` |
| `/api/library/documents/[documentId]/summary` | documentId | GET | `isUuid()` |
| `/api/library/documents/[documentId]/toc` | documentId | GET | `isUuid()` |
| `/api/library/ingest/[jobId]` | jobId | GET/POST | `isUuid()` |

### Documents / Conversations / Knowledge
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/conversations/[id]` | id | GET/PATCH | `isUuid()` |
| `/api/document/[docId]` | docId | GET | `isUuid()` |
| `/api/documents/[id]` | id | GET/PATCH | `isUuid()` |
| `/api/documents/[id]/auto-save` | id | POST | `isUuid()` |
| `/api/knowledge/document/[id]` | id | GET | `isUuid()` |

### Reports / Recommendations / Misc
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/pipeline/status/[jobId]` | jobId | GET | `isUuid()` |
| `/api/recommendations/[userId]` | userId | GET | `isUuid()` |
| `/api/recommendations/jobs/[jobId]` | jobId | GET | inline regex (pre-existing) |
| `/api/reports/[id]/export` | id | GET | `isUuid()` |
| `/api/reports/[id]/publish` | id | POST/DELETE | `isUuid()` |
| `/api/reports/preview/[id]` | id | GET | `isUuid()` |
| `/api/statutes/[id]/summary` | id | GET | `isUuid()` |
| `/api/sse/[id]` | id | GET | `isUuid()` |
| `/api/stream/[chatId]` | chatId | GET | `isUuid()` |

### Phase89 Routes
| Route | Params | Methods | How |
|-------|--------|---------|-----|
| `/api/phase89/node/[id]/docs` | id | GET | `isUuid()` |
| `/api/phase89/node/[id]/similar` | id | GET | `isUuid()` |
| `/api/phase89/related/[id]` | id | GET | `isUuid()` |

---

## Non-UUID Params (Correctly Skipped — 11 routes)

| Route | Param | Type | Notes |
|-------|-------|------|-------|
| `/api/ai/analyze/[scope]` | scope | string enum | `case`, `evidence`, `poi`, `timeline` |
| `/api/ai/generate-report/[scope]` | scope | string enum | `case`, `evidence`, `poi` |
| `/api/canon/chunks/[chunkId]` | chunkId | hash string | Deterministic hash, not UUID |
| `/api/error-brain/history/[filePath]` | filePath | file path | URL-encoded file path |
| `/api/library/citations/[citation]` | citation | text | Citation text string |
| `/api/tags/[tagId]` | tagId | CouchDB key | CouchDB document ID, not UUID |
| `/api/routes/[routeId]/errors` | routeId | varchar(255) | Route path string e.g. `/cases/[id]/overview` |
| `/api/routes/[routeId]/error-brain-analyses` | routeId | varchar(255) | Route path string |
| `/api/routes/[routeId]/error-brain-analysis` | routeId | varchar(255) | Route path string |
| `/api/routes/[routeId]/error-brain-patch` | routeId | varchar(255) | Route path string |
| `/api/routes/[routeId]/error-brain-patch/[patchId]` | routeId | varchar(255) | Route path string (patchId has inline regex) |
| `/api/routes/[routeId]/health-event` | routeId | varchar(255) | Route path string |
| `/api/routes/[routeId]/interactions` | routeId | varchar(255) | Route path string |

---

## Verification

- **svelte-check**: 0 errors at time of writing (Mar 2026); as of Apr 7: 2 pre-existing errors (dag-cache CouchDB type, mcp/server model property) unrelated to UUID validation
- **Playwright**: 28/28 UUID validation tests passing (698 total suite as of Apr 7)
- Validation is additive — only rejects malformed input, no behavior change for valid UUIDs
