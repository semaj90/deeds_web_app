# Card 1: Envelope Extraction — Quick Start

**Status**: ✅ Ready to execute  
**Session**: 105 (Now)  
**Duration**: ~1 hour  
**Exit criteria**: All three scripts pass validation

---

## The Mission

Backfill the last two missing pieces of canonical identity:
- **tree_node_id**: 5% → 100% (ties packets to Neo4j topology)
- **used_concepts**: 0.1% → 80%+ (semantic enrichment)

Then validate all 8 canonical fields are stable and complete.

---

## Three Scripts, Three Steps

### Step 1: Backfill tree_node_id (20 min)

```bash
cd sveltekit-frontend

# Preview (safe, no writes)
node scripts/atlas/propagate-tree-node-ids.mjs --dry-run

# Execute
node scripts/atlas/propagate-tree-node-ids.mjs
```

**Expected**: tree_node_id ≥95% in atlas_packets + atlas_summary_layers

**What it does**: Resolves 55,457 missing tree_node_id values using source_ref + directory_path → Neo4j walk-up

---

### Step 2: Wire used_concepts Lane (25 min)

```bash
# Preview
node scripts/atlas/wire-used-concepts-lane.mjs --dry-run

# Execute
node scripts/atlas/wire-used-concepts-lane.mjs
```

**Expected**: used_concepts ≥80% populated + GIN index created

**What it does**: Extracts keywords/entities from lexical features → used_concepts array

---

### Step 3: Validate Envelope (2 min)

```bash
node scripts/atlas/validate-envelope-extraction.mjs --verbose
```

**Expected**: Exit code 0 (all gates pass)

**What it checks**:
- ✅ packet_key: 100%
- ✅ source_ref: 100%
- ✅ feature_id: 100%
- ✅ title_id: 100%
- ✅ domain_class: 100%
- ✅ tree_node_id: ≥95%
- ✅ used_concepts: ≥80%
- ⚠️ qdrant_point_id: May be 0% (expected, fixed in Card 2)

---

## Success = All Three Pass

If all three scripts exit with code 0, Card 1 is **COMPLETE**.

That means:
- 58,365 packets have stable, complete canonical identity
- tree_node_id links every packet to Neo4j topology
- used_concepts enriches semantic understanding
- **HMM Gate 3 unblocked** (recovery packet selection 2→14/16 domains)
- **Card 2 and 3 can run in parallel** (Qdrant bridge + SOM topology)

---

## Rollback (if needed)

```sql
-- Restore NULL state (before Card 1)
UPDATE atlas_packets SET tree_node_id = NULL, used_concepts = NULL 
WHERE updated_at > NOW() - INTERVAL '1 hour';

UPDATE atlas_summary_layers SET tree_node_id = NULL, used_concepts = NULL 
WHERE updated_at > NOW() - INTERVAL '1 hour';

DROP INDEX IF EXISTS idx_packets_used_concepts_gin;
```

---

## After Card 1

Once validation passes:
1. Save this session: `SESSION-105-ENVELOPE-EXTRACTION-COMPLETE.md`
2. Start Card 2 (Qdrant bridge) and Card 3 (SOM topology) **in parallel**
3. Both are now unblocked by complete envelope extraction

---

## Files Created

- ✅ `scripts/atlas/propagate-tree-node-ids.mjs` (1A)
- ✅ `scripts/atlas/wire-used-concepts-lane.mjs` (1B)
- ✅ `scripts/atlas/validate-envelope-extraction.mjs` (1C)
- ✅ `docs/CARD-1-ENVELOPE-EXTRACTION-READY.md` (full reference)

---

**Ready? Run Step 1 now.**
