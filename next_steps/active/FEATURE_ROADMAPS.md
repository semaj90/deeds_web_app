# Feature Roadmaps — Consolidated

**Created**: April 19, 2026 (consolidated from 3 source files)
**Status**: ACTIVE — All features designed, implementation pending

---

## 1. User Analytics + Neo4j Graph (Medium Priority)

**Status**: CODE EXISTS (18 files, all wired), NEEDS DATA + VALIDATION

### What's Built
- Analytics store (`analytics.svelte.ts`) — 19 routes, batched flush (30s/100 events)
- Event logger → PostgreSQL + RabbitMQ `analytics.track` queue
- Neo4j write sync: VIEWED/CREATED/SEARCHED edges
- Neo4j read: 4 Cypher queries (2-hop traversal, degree centrality, connected cases, multi-hop neighbors)
- ACE context injection: 3 parallel queries (PG patterns + Neo4j cases + Qdrant past queries) → ≤400 chars in system prompt
- Dashboard UI (`analytics/+page.svelte`) — 473 lines, 3 tabs
- Recommendations API — 477 lines, 5-signal ranking pipeline
- Graph recommendations API — 145 lines, LLM-based

### Pending (Runtime Steps)
- [ ] Activate Neo4j container + seed from PostgreSQL (`scripts/seed-neo4j.mjs`)
- [ ] End-to-end validation: recommendations API, graph recs, SSE chat Neo4j context
- [ ] User-specific graph recommendations (VIEWED/SEARCHED/ANALYZED edges + PageRank)
- [ ] Similar-queries wiring (Qdrant `user_searches` collection)
- [ ] Dashboard enhancements (real-time graph visualization)
- [ ] `.env.example` — add Neo4j connection vars

---

## 2. 3D Prosecutor Simulation (Long-Term)

**Status**: DESIGN COMPLETE — All 6 phases pending. Large effort.

### Phase 1: Canon Schema + Taxonomy
- [ ] Drizzle schema: `canonical_documents`, `canonical_chunks`, `terms`, `examples`, `term_examples`
- [ ] Jurisdiction taxonomy enum (US-FED, CA, NY, etc.)
- [ ] Deterministic chunk IDs with NFKC normalization

### Phase 2: Canon Ingestion (~200-400 chunks)
- [ ] FRE fundamentals (Rules 401-403, 801-807)
- [ ] Core federal statutes (18 USC § 1343, § 1030, § 922)
- [ ] 100-200 SCOTUS exemplar chunks from existing PostgreSQL corpus
- [ ] Provenance tracking: source URL, citation, license_tag, retrieved_at

### Phase 3: Fictional Case Generator Enhancement
- [ ] Full case schema: `fictional_cases` → `case_events` → `actors` → `witness_statements` → `evidence_items` → `chain_of_custody_events` → `charges` → `defenses`
- [ ] `canonical_support` links (each charge/defense → canon chunk IDs)
- [ ] Consistency verifier (rules + LLM loop)
- [ ] Generate 50 cases with full evidence + chain of custody

### Phase 4: Qdrant Hybrid Retrieval
- [ ] `legal_canon_chunks` collection — dense + BM25 sparse vectors
- [ ] Prosecutor/defense persona retrieval profiles

### Phase 5: QLoRA Prosecutor Persona
- [ ] Fine-tune prosecution reasoning style
- [ ] Citation-faithful output (every claim → canon chunk or marked fictional)

### Phase 6: 3D Courtroom API
- [ ] API endpoints for courtroom simulation
- [ ] Real-time objection/ruling mechanics

---

## 3. POI AI Enhancements (Long-Term)

**Status**: ARCHITECTURE DESIGNED — 4 major features, all pending.

### Face Recognition + Similarity Search
- [ ] Face detection pipeline (FaceNet/ArcFace → 512D embeddings)
- [ ] pgvector similarity search (`face_embedding <=> $target` with threshold)
- [ ] Cross-POI matching (same person across cases)
- [ ] Quality scoring (brightness, sharpness, pose estimation)

### Auto Photo Categorization
- [ ] AI-powered tagging (scene type, indoor/outdoor, document vs. photo)
- [ ] Evidence type inference from visual content

### EXIF/GPS Metadata Extraction
- [ ] Automated EXIF parsing on upload
- [ ] GPS coordinate extraction + map plotting
- [ ] Timeline reconstruction from photo timestamps

### Photo Quality Scoring
- [ ] Automated quality assessment (blur, exposure, noise)
- [ ] Forensic integrity verification (manipulation detection)

---

## Consolidated From

- `USER_ANALYTICS_NEO4J_VECTOR_CHAT.md`
- `3D_PROSECUTOR_SIMULATION_ROADMAP.md`
- `poi-ai-enhancement-roadmap.md`