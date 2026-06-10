# Phase 3: Strategic Pivot — From Retrieval Metrics to Agentic Execution
**Date:** 2026-06-10  
**Decision:** Complete architectural reframing  
**Authority:** User direction after community coverage baseline check  

---

## The Inflection Point

**Initial Phase 3 design (4-gate retrieval focus):**
- Gate A: Retrieval benchmark (100 queries, MRR/Recall metrics)
- Gate B: Authority reranker (topology weighting)
- Gate C: Community coverage (34% → >95%)
- Gate D: Active learning (harvest failures)

**Realization:** This measures retrieval **quality**, but doesn't answer the harder question: **Can the system execute repairs agentic ally?**

---

## The Missing Link

```
✅ Packet materialization complete (ATLAS-1.0)
✅ Topology complete (ATLAS-2.0)
✅ Retrieval infrastructure complete
❌ Symbol extraction missing (cannot map source_ref → functions → skills)
❌ Community coverage 0% (Phase 2B did not persist)
❌ Repair skill registry missing (cannot execute fixes)
```

**Root cause:** Phase 2B (Neo4j communities) extracted community assignments but never persisted them to glyph_records or nes_chrom_packets payloads.

**Consequence:** Authority reranker (Gate B) depends on community context. Without community_id, reranker is crippled.

---

## The Strategic Shift

**Old framing:** 
```
Build retrieval metrics → Prove quality improves → Then build agentic execution
```

**New framing:**
```
Build symbol map (source_ref → functions) → Fix community persistence → Build agentic repair loop → Then validate metrics
```

**Why:** Symbols are the **binding layer** between cartridge memories (NES/CHR packets) and live executable code. Without this layer:
- Authority reranker has no context (community_id = 0%)
- Repair skill lookup fails (don't know which functions exist)
- Active learning captures no repair signals (no repairs executed)
- Metrics become meaningless (no ground truth)

---

## ATLAS-3A: The Real Foundation

**ATLAS-3A extracts:**
```
source_ref (src/routes/api/auth/register/+server.ts)
  ↓
symbols (POST handler, registerUser function, validation schema)
  ↓
classification (api_handler_POST, function, zod_schema)
  ↓
links (feature_id = auth-register, packet_key = pk:abc123)
  ↓
payload (signature, line numbers, repair skill candidates)
```

**This enables:**
```
Query: "username already taken"
  ↓
Packet retrieval: auth-register packet found
  ↓
Symbol lookup: Find POST handler in +server.ts
  ↓
Repair skill: drizzle-23505-unique-constraint-fix
  ↓
Execution: Dry-run patch, validate, self-heal
```

**Without ATLAS-3A, this entire flow breaks.**

---

## Revised Phase 3 Execution Order

### ATLAS-3A: Symbol Map (Week 1) ← **START HERE**

**Created:**
- Migration: `drizzle/manual/atlas-3a-symbol-map.sql` (atlas_symbol_map + bridge table)
- Extractor: `scripts/atlas/extract-symbol-map.mjs` (ts-morph AST walk)
- npm scripts: `atlas:extract-symbols`, `atlas:extract-symbols:dry`, `atlas:extract-symbols:audit`

**Actions:**
1. Run extraction: `npm run atlas:extract-symbols` (populate atlas_symbol_map)
2. Populate bridge: source_ref → file_path → community_id
3. Backfill glyph_records: `UPDATE glyph_records SET community_id = ...` (restore Phase 2B)
4. Verify gate: community_id coverage >95%

**Success:** 14,500+ symbols extracted, >80% linked to packets, >95% community coverage restored

---

### ATLAS-3B: Repair Skill Registry (Week 2)

**Depends on:** ATLAS-3A symbols populated

**Creates:**
- `repair_skills` table (skill_id, error_pattern, fix_function, validation_tests)
- `error_pattern_detector.ts` (classify errors by type)
- Skill lookup: error_stack → source_ref → symbol_kind → repair_skill

**Success:** Map 20+ error patterns → repair skills, with dry-run validation

---

### ATLAS-3C: HyperRAG Authority Reranker + Benchmark (Week 3)

**Depends on:** ATLAS-3A (community_id restored) + ATLAS-3B (repair context understood)

**Now includes:**
- Gate A: 100-query benchmark (retrieval metrics)
- Gate B: Authority reranker (0.35·vector + 0.25·graph + 0.20·community + ...)
- Gate C: Community coverage >95% (from ATLAS-3A backfill)
- **New:** Symbol accuracy measurement (does retrieval find correct function?)

**Success:** Recall@20 >0.92, MRR >0.90, authority formula tuned, symbols accurate >90%

---

### ATLAS-3D: Active Learning (Week 4)

**Depends on:** ATLAS-3A/3B/3C all operational

**Captures:**
- Query → packet → symbol → repair_skill → patch → test_result
- Real outcomes (success/failure)
- Repair signals for LoRA fine-tuning

**Success:** 1,000+ labeled repair examples harvested, ready for fine-tuning

---

## Immediate Actions (Today)

1. ✅ **Created:** Symbol map migration + extractor
2. ✅ **Added:** npm scripts
3. 📋 **Next:** Run `npm run atlas:extract-symbols:dry` (verify extraction works)
4. 📋 **Then:** Run `npm run atlas:extract-symbols` (populate tables)
5. 📋 **Then:** Create backfill script (restore community_id from bridge)
6. 📋 **Then:** Verify: `SELECT 100 * COUNT(community_id) / COUNT(*) FROM glyph_records` > 95

---

## Why This Order Matters

**You cannot validate retrieval quality without:**
1. Knowing which functions/routes exist (ATLAS-3A symbols)
2. Having community context for topology (community_id backfill)
3. Being able to execute repairs (ATLAS-3B skills)
4. Having real repair outcomes (ATLAS-3D training data)

**Build in reverse: execution infrastructure first, then metrics.**

---

## Reference Architecture

```
                      ┌──────────────────────────────┐
                      │   User Query                  │
                      └──────────────┬─────────────────┘
                                     ↓
                      ┌──────────────────────────────┐
                      │   Query Embedding (L1/L2)    │
                      └──────────────┬─────────────────┘
                                     ↓
                      ┌──────────────────────────────┐
                      │   Qdrant ANN + Tags          │
                      │   (semantic search)          │
                      └──────────────┬─────────────────┘
                                     ↓
                      ┌──────────────────────────────┐
         ┌─────────→  │   Top-K Packets (feature_id) │  ←─────┐
         │            └──────────────┬─────────────────┘       │
         │                           ↓                         │
         │            ┌──────────────────────────────┐         │
         │            │   ATLAS-3A: Symbol Lookup    │         │
         │            │   by source_ref              │         │
         │            └──────────────┬─────────────────┘         │
         │                           ↓                         │
         │            ┌──────────────────────────────┐         │
         │            │   Find Function/Route Action │         │
         │            │   (api_handler_POST, etc.)   │         │
         │            └──────────────┬─────────────────┘         │
         │                           ↓                         │
         │            ┌──────────────────────────────┐         │
         │  ┌────→    │   ATLAS-3B: Repair Skills    │    ←─┐  │
         │  │         │   by error pattern           │      │  │
         │  │         └──────────────┬─────────────────┘      │  │
         │  │                        ↓                       │  │
         │  │         ┌──────────────────────────────┐      │  │
         │  │         │   Try Repair (dry-run)       │      │  │
         │  │         │   Test if fix validates      │      │  │
         │  │         └──────────────┬─────────────────┘      │  │
         │  │                        ↓                       │  │
         │  │         ┌──────────────────────────────┐      │  │
         │  │         │   Success? Update Packet     │      │  │
         │  │         │   (glyph_records)            │      │  │
         │  │         └──────────────┬─────────────────┘      │  │
         │  │                        ↓                       │  │
         │  │         ┌──────────────────────────────┐      │  │
         │  │         │   ACE Context Assembly       │      │  │
         │  │         │   (with repair trace)        │      │  │
         │  │         └──────────────┬─────────────────┘      │  │
         │  │                        ↓                       │  │
         │  │         ┌──────────────────────────────┐      │  │
         │  │         │   Gemma4 Synthesis           │      │  │
         │  │         │   (with repair context)      │      │  │
         │  │         └──────────────┬─────────────────┘      │  │
         │  │                        ↓                       │  │
         │  │         ┌──────────────────────────────┐      │  │
         │  └────→    │   ATLAS-3D: Log Repair      │    ←─┘  │
         │            │   Outcome (success/fail)    │         │
         │            └──────────────┬─────────────────┘         │
         │                           ↓                         │
         └───────────────────────────────────────────────────→  │
                                                               │
                      ┌──────────────────────────────┐         │
                      │   LoRA Training Candidates   │ ←───────┘
                      │   (real repair pairs)        │
                      └──────────────────────────────┘

Key: 3A (symbols) + 3B (skills) enable 3C (authority reranking) + 3D (learning)
```

---

## Success Criteria (Phase 3 Complete)

- ✅ **ATLAS-3A:** 14,500+ symbols extracted, >80% linked to packets
- ✅ **Community coverage:** >95% (backfilled from Phase 2B)
- ✅ **ATLAS-3B:** 20+ repair skills registered, error patterns mapped
- ✅ **ATLAS-3C:** Benchmark stable (Recall@20 >0.92, MRR >0.90, authority formula validated)
- ✅ **ATLAS-3D:** 1,000+ real repair outcomes captured for LoRA

**Then Phase 4:** CHR97 cartridge compression with proven execution capability.

---

**This is not a cosmetic reordering. ATLAS-3A is the foundation. Without it, Phases 3B/3C/3D are architectural dead ends.**

**Start with symbol extraction today.**
