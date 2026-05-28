# Universal App Readiness Checklist

Revision: 2026-05-27

Purpose
-------
This checklist aligns Product and Engineering for the Legal-AI workspace. It moves the project from "many cool systems" to a single, testable product by focusing on core user jobs, data contracts, retrieval guarantees, memory hygiene, agent workflows, UI coverage, performance, and production readiness.

Point of the app (one sentence)
--------------------------------
Legal-AI workspace: ingest documents, evidence, code, and session memory; find and surface top answers with proof; recommend next actions and remember what worked.

Main user jobs
--------------
- Discover relevant facts and documents
- Summarize and verify claims with sourceRefs
- Organize evidence and case materials
- Act (patch / fix / recommend) and record outcomes
- Reuse what worked previously (memory)

Main themes / feature clusters
------------------------------
1. Legal search: opinions, evidence, case docs, citations, sourceRefs
2. AI memory: ACE packets, scenario cache, startup context, claude-mem, engram
3. Retrieval infra: Qdrant, Neo4j, Redis, TurboVec, Graphify, Parent Atlas
4. Document org: summaries, tags, hot/cold docs, duplicates, gaps
5. Agent workflow: OpenCode, Gemma4 patch cards, smoke tests, TODO tracking
6. UI workspace: search bar, top-10 results, case view, evidence timeline, recommendations
7. Performance: cache-first, embeddings, quantization, MessagePack, batch ingestion

Checklist
---------

## 1. Product Purpose
- [ ] Can explain app in one sentence
- [ ] Main user is defined
- [ ] Top 5 user jobs are defined
- [ ] Features map to real user jobs
- [ ] Unused experiments are marked optional/downstream

## 2. Data Ingestion
- [ ] Files enter through manifest or ingestion UI
- [ ] Raw files stored outside prompt path (separation of signal & prompt)
- [ ] Text/OCR extraction pipeline works and is monitored
- [ ] Summaries generated before chunk search (preview & verify)
- [ ] `sourceRefs` created and preserved for every claim and chunk

## 3. Retrieval
- [ ] Qdrant search is healthy and returns stable vectors
- [ ] Graphify / Neo4j relationships are populated and used for rerank
- [ ] TurboVec / reranker preserves `sourceRefs` and ordering
- [ ] Redis cache has observable hit/miss counters for repeated queries
- [ ] Top-10 grouped results UI matches backend grouping contract

## 4. Memory
- [ ] ACE packet cache exists and can be invalidated safely
- [ ] Startup prompt cache works and is deterministic
- [ ] Scenario cache and supersede rules exist (old memories can be superseded)
- [ ] Old/raw logs do not enter the prompt path (no hiddenThoughts)
- [ ] Memory write paths are auditable and include sourceRefs

## 5. Agent Workflow
- [ ] Gemma4 patch cards are generated (compact JSON only)
- [ ] OpenCode subagent can apply one patch in a dry-run mode
- [ ] Smoke test validates applied patch (pass/fail recorded)
- [ ] Failed patches are archived with reason and logs
- [ ] Successful patches generate a memory/event for future retrieval

## 6. UI
- [ ] Search page with filters (docs, evidence, code, memory)
- [ ] Top-10 results page with grouped UI sections and sourceRefs
- [ ] Document / Case detail page with summary, key facts, timeline
- [ ] Evidence timeline view with linkage to documents and clips
- [ ] Recommendations / Agent panel showing actions, patch-cards, smoke status
- [ ] Admin / indexing / ingestion status page

## 7. Performance
- [ ] No raw giant logs or full documents shipped into chat responses
- [ ] Batch embeddings supported (ingest pipeline)
- [ ] Ollama or other heavy models not used for bulk ingestion (use local embed service)
- [ ] MessagePack used for cache / transport where beneficial, documented
- [ ] JSONB remains the searchable single source of truth for Postgres-backed records

## 8. Production Cleanup
- [ ] Generated folders excluded from operations and archives (node_modules, .svelte-kit, .vite, build)
- [ ] Secrets excluded and verified (no keys in repo)
- [ ] DB migrations reviewed and sidecar migrations documented
- [ ] Broken experiments and orphaned services disabled or moved to `deeds_labs/`
- [ ] Build / check / smoke pipeline passes locally before pushing

What to reduce (product scope decisions)
---------------------------------------
- Keep core: search, summaries, sourceRefs, top-10 recommendations, cache, patch cards, smoke tests
- Mark optional: LangGraph, AnythingLLM, CUDA streams, RNN experiments, WebGPU matrix, RL ranking, multi-sidecar complexity

UI mockup ideas (quick)
------------------------
Home:
[Search legal docs / evidence / code / memory...]

Results layout (left → right):
- Search filter pane
- Top-10 Documents
- Top-10 Evidence Items
- Top-10 Related Cases
- Top-10 Recommended Actions (agent suggestions)

Document View:
- Summary (auto-generated)
- Key Facts (bulleted with `sourceRefs`)
- Citations / sourceRefs (expandable)
- Related Evidence (linked)
- Timeline (if present)
- "Ask follow-up" quick-action

Agent Panel:
- Recommended Fixes
- Patch Cards (compact JSON)
- Smoke Test Status (pass / fail / archived)
- Memory Updates (what changed)

Admin:
- Ingestion status (recent files, errors)
- Qdrant collections and vector stats
- Redis cache hits and top keys
- Graphify map / hot clusters
- Hot/Cold documents list

Product mantra (caveman):
Legal Google + case brain + proof links + AI helper that remembers and fixes itself.

---
File created by automation on 2026-05-27 to capture the universal checklist.
