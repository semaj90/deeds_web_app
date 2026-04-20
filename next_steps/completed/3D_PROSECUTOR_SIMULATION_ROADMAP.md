# 3D Prosecutor Simulation — Implementation Roadmap

## Source
Distilled from deep research: "Building a 3D Prosecutor Simulation With Fictional Cases and High-Fidelity Legal Realism"

---

## Architecture Overview

Two intertwined systems:
- **A. Legal-Content Pipeline**: Ingest authoritative materials → generate fictional cases → publish with stable IDs, provenance, jurisdiction tags
- **B. ML/Engineering Stack**: Hybrid retrieval (BM25 + dense) on Qdrant → QLoRA fine-tuned prosecutor persona → citation-faithful, jurisdiction-aware output

### Key Principle
> Every generated statement claiming "the law is X" must either (a) cite a canonical chunk, or (b) be marked as fictional narrative.

---

## Phase 1: Canon Schema + Taxonomy + IDs

### Tables Needed
- `canonical_documents` — real laws/opinions with jurisdiction tags, authority level, license tag
- `canonical_chunks` — stable chunk IDs (`{doc_id}:{chunk_index}:{sha256_16}`), semantic labels
- `terms` — glossary with domain/jurisdiction tags, formal/plain definitions
- `examples` + `term_examples` — ExampleBank M2M (illustrates, contrast_with, element_of)

### Authority Levels
1. **Primary/controlling**: statutes, regulations, rules, binding opinions, published jury instructions
2. **Persuasive**: non-binding opinions, treatises, agency guidance
3. **Secondary**: Cornell LII, Shouse Law explainers

### Actions
- [ ] Create `canonical_documents` + `canonical_chunks` Drizzle schema
- [ ] Create `terms` + `examples` + `term_examples` tables (ExampleBank)
- [ ] Add jurisdiction taxonomy enum (US-FED, CA, NY, etc.)
- [ ] Implement deterministic chunk ID strategy with NFKC normalization

---

## Phase 2: Canon Ingestion MVP (~200-400 chunks)

### Data Sources & Licensing
| Source | License | Use |
|--------|---------|-----|
| CourtListener bulk | "Free of known copyright restrictions" | Case opinions |
| CAP (case.law) | CC0 (incl. Hugging Face) | Case opinions |
| Cornell LII | Copyrighted compilation — pointer only | Rule text reference |
| Shouse Law | Non-commercial reuse constraints | Minimal excerpts only |
| Black's Law Dictionary | Copyrighted commercial — reference only | Quality benchmark |

### Actions
- [ ] Ingest FRE fundamentals (Rules 401-403, 801-807, etc.) from official sources
- [ ] Ingest core federal statutes (18 USC § 1343, § 1030, § 922, etc.)
- [ ] Ingest 100-200 SCOTUS exemplar chunks from existing PostgreSQL corpus
- [ ] Track provenance: source URL, citation, license_tag, retrieved_at for every doc

---

## Phase 3: Fictional Case Generator Enhancement

### Current State (DONE)
- 8 categories: wire_fraud, drug_trafficking, firearms, cybercrime, obstruction, verbal_contracts, tort_federal, federal_employee_liability
- Disk cache + resume + retry backoff
- Fictionalization transforms (names, dates, cities, amounts)
- Guardrail blocklist

### Needed Enhancements
- [ ] Full case schema: `fictional_cases` → `case_events` → `actors` → `witness_statements` → `evidence_items` → `chain_of_custody_events` → `charges` → `defenses` → `jury_instructions_used`
- [ ] Who/What/Why/How taxonomy as first-class fields (not just narrative)
- [ ] `canonical_support` links: each charge/defense → canon chunk IDs
- [ ] Consistency verifier: rules + LLM verifier loop
- [ ] Evidence admissibility issues linked to FRE chunks
- [ ] Generate 50 cases with full evidence + chain of custody

---

## Phase 4: Qdrant Hybrid Retrieval

### Collection Design
- `legal_canon_chunks` — real law, dense + BM25 sparse vectors
- `fictional_case_chunks` — fictional cases, same vector config
- Optional: `example_bank_chunks`

### Payload Schema (per chunk)
```
chunk_id, doc_id, doc_type,
jurisdiction.primary, jurisdiction.tags[],
authority.level (primary/persuasive/secondary/fictional),
provenance.source, provenance.url, provenance.citation,
concepts.domains[], concepts.key_terms[],
who.roles[], what.action, why.mens_rea, how.evidence_type,
confidence.score, safety.flags[]
```

### RAG Pipeline
```
Query + jurisdiction → Normalizer → [Sparse BM25 | Dense vector] → RRF Fusion → Reranker → Context packer → Generator LLM → Output with citations
```

### Actions
- [ ] Create `legal_canon_chunks` collection with dense (768-dim) + BM25 sparse named vectors
- [ ] Chunk canonical docs by type (statutes: 200-500 tok, opinions: 600-1200 tok)
- [ ] Implement payload filtering by jurisdiction + authority level
- [ ] Add cross-encoder reranker for top-k precision
- [ ] Build retrieval eval harness (labeled query sets, precision/recall)

---

## Phase 5: QLoRA Fine-Tune — Prosecutor Persona

### Training Data Layers
1. **Fictional prosecutorial dialogue** (highest volume) — opening statements, cross outlines, objections
2. **Citation discipline tasks** (critical) — query + chunks → answer with chunk ID citations
3. **Legal canon paraphrase** (low volume, risk-managed) — short excerpt → plain language

### Safety Constraints
- **Refusal head**: if jurisdiction missing or low-confidence retrieval → ask for scope
- **Citation completeness**: every doctrinal claim needs ≥1 citation chunk
- **Defamation/privacy**: all fictional; never copy real accusations

### Actions
- [ ] Prepare training dataset: fictional dialogue + citation discipline + canon paraphrase
- [ ] QLoRA NF4 fine-tune via Unsloth (Apache 2.0 core)
- [ ] Eval: hallucination rate, citation fidelity, adversarial tests
- [ ] Human SME review: 10 cases end-to-end

---

## Phase 6: 3D Integration + API

### Game Content Delivery
- Scene scripts, dialogue turns, evidence interactions served via API
- 3D engine (Three.js/Babylon.js) consumes structured case data
- Courtroom interactions backed by RAG-retrieved legal authority

### Actions
- [ ] Define simulation API contract (case files, dialogue turns, evidence interactions)
- [ ] Wire 3D courtroom to prosecutor persona API
- [ ] Ship UI disclaimers: "fictional simulation, not legal advice"
- [ ] Logging: prompts + outputs + retrieved chunks for audit trail

---

## Evaluation Metrics

| Metric | What it measures |
|--------|-----------------|
| Legal accuracy | Match reference answers on curated benchmarks |
| Citation fidelity | % claims mapped to retrieved chunks; % citations correct |
| Hallucination rate | Unsupported assertions, invented citations, wrong standards |
| Retrieval precision/recall | Top-k contains required chunks for labeled queries |
| Adversarial tests | Fake statute, wrong jurisdiction, conflicting evidence |
| Human review | SME sign-off per release |

---

## Chunking Parameters by Doc Type

| Doc type | Target tokens | Overlap | Notes |
|----------|--------------|---------|-------|
| Statutes/rules | 200-500 | 30-80 | Keep citations close; no mid-subsection splits |
| Jury instructions | 200-600 | 50-100 | Preserve numbering/title |
| Court opinions | 600-1,200 | 100-200 | Add pinpoint metadata |
| Fictional case files | 400-900 | 80-150 | Chunk by procedural phase |

---

## Scaling (50 → 1,000+ cases)
- Expand canon: state statutes + state pattern instructions
- Multi-jurisdiction payload filters
- Nightly content audits: missing citations, jurisdiction conflicts, CoC breaks
- Retrieval regression tests per domain
- CourtListener quarterly bulk refresh
