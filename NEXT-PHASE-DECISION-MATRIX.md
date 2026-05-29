# Next Phase Decision Matrix — 2026-05-29

**Your Current State:**
- ✅ Phase 1 Glyphs complete (78 ACE cards ingested)
- ✅ Parent Atlas Phase 1 complete (semantic cache tested)
- ✅ Gemma4 agentic workflows ready
- ⏳ 70 GB repository (optimization opportunities available)

**Decision Required:** Which work stream to prioritize over next 48 hours?

---

## Option A: Core Production Path (7 hours)

### Phase 2 Glyphs + Phase 2 Atlas

**What:** Compute GRPO rewards + extract function call edges

**Phase 2 Glyphs (2-3 hours)**
```
Input: 78 glyphs (58 KB metadata in glyph_records)
  ↓
Compute Similarity: Each glyph vs Qdrant codebase_chunks_768 (GPU cosine)
  ↓
Score GRPO Reward: Use existing GRPO policy
  ↓
Output: Training triples (glyph, reward, vector embedding)
  ↓
Materialize: JSONL format for QLoRA fine-tuning
```
- Uses existing infrastructure (no new services)
- ~2000 similarity computations (GPU accelerated)
- Risk: Low (isolated transformation layer)
- Unblocks: Phase 3 (active learning sampler)

**Phase 2 Atlas (3-4 hours)**
```
Input: 3000 TypeScript files in codebase
  ↓
Extract: Function call expressions using TypeScript AST
  ↓
Build Edges: file1.ts → calls → file2.ts (5K-10K edges)
  ↓
Sync: Neo4j graph + Redis cache
  ↓
Test: Verify edges resolve correctly
```
- Unblocks: Phases 3-5 (knowledge graph foundation)
- Risk: Low (read-only extraction, tested on samples)
- ROI: High (5K-10K new edges immediately useful)

**Time Commitment:** ~7 hours (can be split across 2-3 sessions)  
**Outcome:** Production-ready training data + knowledge graph foundation

---

## Option B: Full UI Sprint (14 hours)

### Core + NES Components in Parallel

**Includes Option A, plus:**

**NES Glyph Tile UI (7 hours)**
- GlyphTile.svelte — 16×16 pixel preview (1h)
- GlyphTileDetail.svelte — bits-ui Dialog with metadata (2h)
- Route `/glyphs/atlas` — grid viewer + filtering (2h)
- `/api/glyphs/[id]` endpoint (1h)
- Integration tests (1h)

**Infrastructure:** Mostly existing  
- GlyphAtlasPanel.svelte (784 LoC, fully operational) ✅
- API routes `/api/glyph/*` ✅
- UnoCSS styling ✅

**Risk:** Low (straightforward Svelte 5 components, design complete)  
**Value:** User-facing feature (useful for exploration + demos)

**Time Commitment:** 7 hours for UI, plus 7 hours core  
**Total:** ~14 hours

---

## Option C: Full Sprint (20-28 hours)

### All Work Streams in Parallel

**Includes Options A + B, plus:**

**3-Track Reconstruction Lane A (4-6 hours)**
- Polish 2D legal timeline viewer
- Wire evidence-to-timeline mapping
- Add temporal filtering UI
- Parallel with core work

**Codebase Cleanup (1-2 hours, optional)**
- Remove `.svelte-kit/` (2.3 GB)
- Run `git gc --aggressive`
- Clean `.cache/` and session artifacts
- Saves 3-4 GB, no functional impact

**Extended Phase 2 Atlas (bonus)**
- Phase 3 (USES_DB edges) — 2-3 hours
- Phase 4 (USES_TOOL edges) — 2-3 hours

**Time Commitment:** 20-28 hours across sessions  
**Outcome:** Production-ready platform with all features active

---

## Comparison Table

| Aspect | Option A | Option B | Option C |
|--------|----------|----------|----------|
| **Core Work** | ✅ Phase 2 Glyphs + Atlas | ✅ Same + NES UI | ✅ All features |
| **Hours (Committed)** | 7 | 14 | 20-28 |
| **Risk Level** | Low | Low | Low-Medium |
| **User-Facing Features** | None (backend) | Timeline + grid viewer | Full platform |
| **Production Blockers Resolved** | 90% | 95% | 100% |
| **Time to Production** | 2-3 sessions | 2-3 sessions | 3-5 sessions |
| **Codebase Cleanup** | Optional | Optional | Can include |

---

## What Each Option Enables

### Option A Enables:
- ✅ GRPO training pipeline (fine-tune Gemma on legal glyphs)
- ✅ Neo4j knowledge graph (5K-10K CALLS edges)
- ✅ Production analysis (Gemma4 + MCP + Atlas)
- ✅ Phase 3-5 Atlas work (next 20-30 hours planned)

### Option B Enables (all of A, plus):
- ✅ Glyph exploration UI (human-friendly visualization)
- ✅ Timeline reconstruction viewer
- ✅ Demo-ready platform (for stakeholders)

### Option C Enables (all of A+B, plus):
- ✅ Complete 3-track reconstruction (animation + WebGPU)
- ✅ Extended knowledge graph (full Phase 2-4 Atlas)
- ✅ Optimized storage (66-67 GB instead of 70 GB)
- ✅ All planned features operational

---

## My Recommendation

**Start with Option A (Core)**, then evaluate:

1. **Phase 2 Glyphs** (2-3 hours) — highest ROI per hour
   - Unblocks QLoRA fine-tuning
   - Uses existing GPU infrastructure
   - Low risk, immediate value

2. **Phase 2 Atlas** (3-4 hours) — foundation for reasoning
   - 5K-10K function call edges
   - Enables all downstream phases
   - Core to "parent atlas indexing"

3. **Then decide:** Add NES UI (Option B) if time permits, or defer to next session

**Why this order?**
- **Glyphs first:** Data drives everything (GRPO training, demo data, validation)
- **Atlas second:** Knowledge graph enables intelligent routing (MCP tool selection, reasoning)
- **UI third:** Polish/presentation (valuable but not blocking production)

---

## Risk Assessment

### Option A Risks
- **GRPO overfitting:** Mitigated by validation set + monitoring
- **Atlas incompleteness:** Mitigated by phased rollout (don't need all 22-30 hours for MVP)
- **Storage pressure:** Mitigated by cleanup plan (3-4 GB available)

**Overall Risk:** LOW ✅

### Option B Risks
- All Option A risks, plus:
- **UI bugs in new components:** Mitigated by bits-ui patterns + existing infrastructure
- **Integration complexity:** Mitigated by design-first approach (already documented)

**Overall Risk:** LOW ✅

### Option C Risks
- All Option B risks, plus:
- **Scope creep (20-28 hours):** Mitigated by breaking into 2-3 hour chunks
- **Context switching:** Mitigated by parallel execution (Glyphs ≠ Reconstruction)

**Overall Risk:** LOW-MEDIUM ⚠️ (manageable with good session planning)

---

## Decision Points

### If you want production-ready data pipelines:
→ **Choose Option A**
- 7 hours, 90% of production value
- Enables QLoRA fine-tuning
- Unblocks 20-30 hours of Atlas work

### If you want a user-facing demo:
→ **Choose Option B**
- 14 hours, add visual interface
- Glyph grid + timeline viewer
- Stakeholder-ready platform

### If you want the complete platform:
→ **Choose Option C**
- 20-28 hours, all features active
- Full reconstruction pipeline
- Complete knowledge graph
- Optimized storage
- Commitment: 3-5 sessions

---

## Files Ready for Each Option

**Option A:**
- Phase 2 Glyphs spec: `plans/glyphs-as-training-data.md`
- Phase 2 Atlas spec: `docs/atlas-calls-extractor-implementation.md`
- 10-phase roadmap: `docs/atlas-graph-plan-update.md`

**Option B:**
- NES design: `MASTER-IMPLEMENTATION-STATUS-2026-05-29.md#2️⃣`
- Component specs: All bits-ui patterns in CLAUDE.md

**Option C:**
- Reconstruction map: `next_steps/active/2026-05-29_reconstruction-lanes-map.md`
- Cleanup plan: `PRODUCTION-READINESS-2026-05-29.md`

---

## What To Do Right Now

**Your response can be:**

1. **"Go with Option A"** → I start Phase 2 Glyphs immediately (2-3 hrs)
2. **"Do Option B"** → I build UI components in parallel (14 hrs total)
3. **"Full sprint (Option C)"** → I schedule all 3 work streams (20-28 hrs)
4. **"Review first"** → You read spec docs, then decide
5. **"Explain more about X"** → I clarify any work stream before you commit

---

**Status:** All options ready to execute  
**Blockers:** None — decision is yours  
**Recommendation:** Option A (core), with Option B a strong second choice

---

Generated by Claude (Anthropic) on 2026-05-29 13:40 PDT
