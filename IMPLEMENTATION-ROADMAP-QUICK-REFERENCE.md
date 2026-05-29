# Implementation Roadmap — Quick Reference

**Date:** 2026-05-29 | **Status:** 4 work streams launched, Phase 1 (Glyphs) complete

---

## 📋 Four Parallel Work Streams

### 1. **Glyphs As Training Data** — ✅ Phase 1 COMPLETE ✓
**What:** Compress Atlas knowledge as symbolic glyphs for QLoRA fine-tuning  
**Plan:** [`plans/glyphs-as-training-data.md`](plans/glyphs-as-training-data.md)  
**Phase 1 Deliverables** (✅ COMPLETE):
- Drizzle schema: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts:4708-4728` ✅
- SQL migration + UNIQUE constraint on glyph_id ✅
- Ingestion script: `scripts/atlas/ingest-ace-cards-to-glyphs.mjs` (fixed & tested) ✅
- npm aliases: `package.json:30-35` (6 aliases) ✅
- **78 ACE cards ingested into glyph_records table** ✅

**Next:** Phase 2 (compute GRPO rewards, assemble training pairs) — 2–3 hours  
**Status:** Ready to start immediately — no blockers  

---

### 2. **NES Glyph Tile UI** — 🎨 Design Complete
**What:** bits-ui v2 Svelte 5 components wrapping the 16×16 NES grid  
**Design Report:** [nuzzled into MASTER-IMPLEMENTATION-STATUS-2026-05-29.md § 2️⃣](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md#2️⃣-nes-glyph-tile-ui--design--inventory--complete)  
**Existing Infrastructure:**
- `GlyphAtlasPanel.svelte` (784 LoC, canvas rendering, fully operational)
- API routes `/api/glyph/tile-atlas`, `/api/glyph/search`
- Demo route `/demos/crime-reconstruction`

**To Build** (7 hours):
- `GlyphTile.svelte` (1h)
- `GlyphTileDetail.svelte` with bits-ui Dialog (2h)
- Route `/glyphs/atlas` + `+page.server.ts` (2h)
- `/api/glyphs/[id]` endpoint (1h)
- Integration + tests (1h)

**No blockers.** Can start immediately in parallel with Glyphs Phase 2.

---

### 3. **3-Track Reconstruction Lanes** — 🎬 Map Complete
**What:** 2D timeline → ComfyUI stills → Blender animation → WebGPU viewer  
**Map:** [`next_steps/active/2026-05-29_reconstruction-lanes-map.md`](next_steps/active/2026-05-29_reconstruction-lanes-map.md)

**Build Order** (critical path):
```
Lane A (2D Timeline)      4–6h
    ↓
Lane B (ComfyUI Stills)   2–3h
    ↓
Lane D (WebGPU Viewer)    6–8h (parallel with C)
          ↓
    Lane C (Blender)      8–10h
```

**Total:** 20–28 hours across all lanes  
**Recommendation:** Start Lane A after Glyphs Phase 1 ships (lowest risk, unblocks B).

---

### 4. **Codebase Organization** — 📦 Audit Complete
**What:** 41 GB repo → organize, clean build artifacts, document structure  
**Audit:** [§ 4️⃣ in MASTER-IMPLEMENTATION-STATUS](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md#4️⃣-codebase-organization--audit--complete)

**Safe Cleanup** (P1, no risk):
- Delete `.cache/` → 574.9 MB
- Delete `.opencode/sessions/` → ~100 MB
- Run `git gc --aggressive` → ~500 MB–1 GB
- Delete `.svelte-kit/` locally → 2.3 GB (regenerates on build)

**Total potential savings:** 3.5–4 GB  
**Priority:** Low (nice-to-have, can defer).

---

## 🎯 Critical Path (Next 2 Weeks)

### Week 1 (May 29 – Jun 4)

**Must-Do:**
1. ✅ **Docker health check** (5 min) — pre-condition for Phase 1 migration
2. ⏳ **Apply glyph_records migration** (5 min)
   ```bash
   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql
   ```
3. ⏳ **Run ingestion script** (10 min)
   ```bash
   npm run atlas:ingest-glyphs
   ```
4. ⏳ **Glyphs Phase 2** (2–3 hours) — compute GRPO rewards, assemble training pairs
5. ⏳ **Glyphs Phase 3** (1–2 hours) — active learning sampler, nightly pipeline wiring

**Nice-to-Do (parallel):**
- Start NES UI implementation (GlyphTile.svelte → GlyphTileDetail.svelte → route)
- Begin Lane A (2D timeline polish)

### Week 2 (Jun 5 – Jun 11)

- Lane B + Lane C in parallel (2–3h + 8–10h)
- Lane D integration when B+C blocks are lifted
- Codebase cleanup (optional)

---

## 📁 All Deliverables (Organized by Work Stream)

### Glyphs As Training Data
| File | Path | Status |
|---|---|---|
| Type definition | `sveltekit-frontend/src/lib/server/types/glyph.ts:171-176` | ✅ |
| Drizzle schema | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts:4708-4728` | ✅ |
| SQL migration | `sveltekit-frontend/drizzle/manual/20260529_glyph_records.sql` | ✅ |
| Ingestion script | `scripts/atlas/ingest-ace-cards-to-glyphs.mjs` | ✅ |
| npm aliases | `package.json:30-35` | ✅ |
| Implementation plan | [`plans/glyphs-as-training-data.md`](plans/glyphs-as-training-data.md) | ✅ |

### NES UI (Design Ready, Code Pending)
| Component | Path | Est. LOC | Status |
|---|---|---|---|
| GlyphTile | `src/lib/components/glyph/GlyphTile.svelte` | 80 | Design ready |
| GlyphTileDetail | `src/lib/components/glyph/GlyphTileDetail.svelte` | 120 | Design ready |
| GlyphGridViewer | `src/lib/components/glyph/GlyphGridViewer.svelte` | 100 | Design ready |
| Route | `src/routes/(app)/glyphs/atlas/+page.svelte` | 150 | Design ready |
| Route loader | `src/routes/(app)/glyphs/atlas/+page.server.ts` | 50 | Design ready |
| API endpoint | `src/routes/api/glyphs/[id]/+server.ts` | 40 | Design ready |
| Type defs | `src/lib/types/glyph-ui.ts` | 30 | Design ready |

### 3-Track Reconstruction
| Lane | Status | Key Files | Build Hours |
|---|---|---|---|
| A (2D Timeline) | 70% complete | `/api/cases/[id]/timeline`, timeline-engine.ts | 4–6 |
| B (ComfyUI) | 5% complete | comfyui-client.ts, render routes | 2–3 |
| C (Blender) | Schema only | courtroom_models table, scene-compiler.ts | 8–10 |
| D (WebGPU) | 40% complete | src/lib/courtroom/*.ts | 6–8 |
| E (Gaussian Splats) | Deferred | — | — |

### Codebase Organization
| Deliverable | File | Status |
|---|---|---|
| Audit report | [MASTER-IMPLEMENTATION-STATUS-2026-05-29.md](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md) | ✅ |
| Cleanup plan | § 4️⃣ in master document | ✅ |
| Directory map | TBD: `CODEBASE_STRUCTURE.md` | Design ready |

---

## ⚡ How to Use This Roadmap

1. **For Glyphs work:** Start with Phase 1 (done) → Phase 2 plan in [`plans/glyphs-as-training-data.md`](plans/glyphs-as-training-data.md)
2. **For NES UI work:** Reference component tree in [MASTER-IMPLEMENTATION-STATUS § 2️⃣](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md#2️⃣-nes-glyph-tile-ui--design--inventory--complete)
3. **For Reconstruction:** Check [`next_steps/active/2026-05-29_reconstruction-lanes-map.md`](next_steps/active/2026-05-29_reconstruction-lanes-map.md) for lane details
4. **For codebase cleanup:** See [MASTER-IMPLEMENTATION-STATUS § 4️⃣](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md#4️⃣-codebase-organization--audit--complete)

---

## 📞 Blockers & Next Steps

**Immediate (Next 5 minutes):**
- Check Docker: `docker ps | grep legal-ai-postgres`

**After Docker health check (Next 30 minutes):**
- Apply migration: `docker exec -i legal-ai-postgres psql ... < drizzle/manual/20260529_glyph_records.sql`
- Run ingestion: `npm run atlas:ingest-glyphs`

**This week (Pick one to start):**
- **Option A:** Launch Glyphs Phase 2 (GRPO rewards)
- **Option B:** Start NES UI component coding (GlyphTile.svelte)
- **Option C:** Polish Lane A (2D timeline UI)
- **Option D:** Archive & clean codebase (lowest priority)

**Recommendation:** Option A (Glyphs Phase 2), then A+B in parallel, then C.

---

## 📊 Summary Metrics

| Metric | Value |
|---|---|
| Total implementation hours | 20–28 |
| Parallel work streams | 4 |
| Critical path duration | ~20 hours (Glyphs Phase 1→2→3, then Lane A→B→D) |
| Repo size savings (cleanup) | 3.5–4 GB (optional) |
| Phases complete | 1/4 (Glyphs Phase 1) |
| Phases designed | 4/4 (all work streams have full designs) |
| Phases ready to code | 4/4 (no blockers for implementation) |

---

**Last updated:** 2026-05-29 09:30 PDT  
**Master document:** [MASTER-IMPLEMENTATION-STATUS-2026-05-29.md](MASTER-IMPLEMENTATION-STATUS-2026-05-29.md)
