# Enhanced UX Playwright Testing

## Status: IN PROGRESS
## Priority: High
## Created: 2026-03-26

---

## Overview

Comprehensive end-to-end Playwright test suite covering all critical user flows and AI pipeline integration. Tests validate the full lifecycle from case creation through evidence upload, AI analysis, vector search, and retrieval.

## Test Coverage

### New Test Files (5 files, ~28 tests)

| File | Tests | Coverage |
|------|-------|----------|
| `case-notes-lifecycle.spec.ts` | 5 | Case CRUD, notes creation, AI note generation |
| `evidence-pipeline-e2e.spec.ts` | 6 | Upload, metadata, text extraction, case linking |
| `ai-analysis-pipeline.spec.ts` | 6 | Ollama, embeddinggemma, RAG, ACE chat, similarity |
| `vector-search-rag.spec.ts` | 6 | Qdrant, platform search, knowledge base, global search UI |
| `poi-photo-lifecycle.spec.ts` | 5 | POI CRUD, photo upload, VLM tags, gallery |

### Existing Test Infrastructure
- 70+ existing spec files in `tests/`
- Global setup/teardown with `[PW-TEST]` seed data
- `seed-cases.ts` utility for authenticated API contexts
- Sequential execution, 1 worker, 120s timeout

### Key Patterns
- **Graceful AI skipping**: `test.skip()` when Ollama/Qdrant unavailable — suite passes in CI without GPU
- **API + UI hybrid**: Mix browser tests (navigation, forms) with API-level tests (direct endpoint validation)
- **Serial within file**: `test.describe.serial()` for dependent flows (create → upload → verify)
- **Cleanup**: DB cleanup in `afterAll` + `[PW-TEST]` prefix for identification

## Services Tested

| Service | Port | Test Behavior |
|---------|------|---------------|
| PostgreSQL | 5432 | Required — tests fail without DB |
| MinIO | 9000 | Optional — evidence upload tests skip |
| Ollama | 11434 | Optional — AI tests skip |
| Qdrant | 6333 | Optional — vector tests skip |

## Completion Tracking

- [x] Test fixture file (`test-legal-document.txt`)
- [x] Case notes lifecycle tests
- [x] Evidence pipeline E2E tests
- [x] AI analysis pipeline tests
- [x] Vector search & RAG tests
- [x] POI photo lifecycle tests
- [x] Run full suite, verify all pass or gracefully skip (28/28 + 54 validation audit)
- [ ] Add CI pipeline integration
