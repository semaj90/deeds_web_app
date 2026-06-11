# NESCHROM97 Architecture Reframe: Derived Artifact Layer

**Status**: Classification Complete (2026-06-11)  
**Key Insight**: NESCHROM97 is NOT a packet store; it's a semantic evidence layer  
**Implication**: Requires different enrichment strategy than initially planned

---

## The Data

### Canonical Packets (Parent Atlas)
- **Source**: Postgres + Neo4j (canonical truth)
- **Count**: 45 verified packets
- **Authority**: High (verified through retrieval telemetry)

### NESCHROM97 Cards (Semantic Evidence)
- **Source**: Offline indexing pipeline
- **Count**: 8,170 cards
- **Authority**: Medium (derived artifacts)

### Registry Match Result
```
Mapped:   30 cards (0.4%)     → actual packet-like structures
Unmapped: 8,140 cards (99.6%) → derived artifacts
```

---

## Card Taxonomy (Classification Results)

### Distribution

| Kind | Count | % | Avg Confidence | Source |
|------|-------|---|-----------------|--------|
| **directory** | 5,722 | 70% | 0.75 | Directory analysis / topology |
| **feature** | 1,617 | 20% | 0.80 | Feature catalog entries |
| **packet** | 767 | 9% | 0.90 | API route structures |
| **cluster** | 64 | 1% | 0.85 | SOM/GPU cluster summaries |
| **unknown** | 0 | 0% | — | (none classified as unknown) |

### What This Means

**70% directory cards**  
Not packet mirrors — they're structural artifacts from directory topology analysis. They carry directory_path, som_cluster, tags, but NOT source_refs or feature_id alignment.

**20% feature cards**  
Feature catalog entries (AI agent, rag-retrieval, evidence-pipeline). Some map to packets, most don't. They're semantic feature instances, not canonical packets.

**9% packet cards**  
Only 767 of 8,170 cards have API route patterns. This is the ONLY subset that could realistically map to canonical packets.

**1% cluster cards**  
Summaries of SOM/GPU clusters (from GPU-accelerated indexing). These are intermediate computational artifacts, not packets.

---

## The Architecture Shift

### BEFORE (Incorrect Assumption)
```
NESCHROM97
  ↓ (treat as packet store)
Qdrant (mass-enrich all 8,170)
  ↓
Neo4j (create edges for all)
  ↓
HyperRAG (return as cold evidence)
```

**Problem**: Forcing 5,722 directory artifacts + 1,617 feature entries into canonical packet graph = false canonicalization.

### AFTER (Correct Architecture)
```
HOT EVIDENCE (retrieval_telemetry)
  ├─ Query
  ├─ retrieval_strategy (vector_only|lexical_only|structural_only|fusion)
  └─ Selected packet + confidence

WARM EVIDENCE (packets + features)
  ├─ Canonical packets (45 verified)
  ├─ Feature matches
  └─ Neo4j lineage

COLD EVIDENCE (NESCHROM97 derived artifacts)
  ├─ Directory cards (5,722) → topology context
  ├─ Feature cards (1,617) → semantic context
  ├─ Packet cards (767) → partial matches
  └─ Cluster cards (64) → SOM neighborhood
  
[Sidecar registry] ← neschrom97-card-taxonomy.json
  └─ card_id → kind → confidence → derived_from
```

---

## Enrichment Strategy (Revised)

### Tier 1: Enrich Only Mapped Cards (SAFE)

**Current state**: 30 cards from registry match canonical packets.

```json
{
  "neschrom97": {
    "card_id": "00f40d2dcdb83d70",
    "card_hash": "...",
    "registry_confidence": 0.5,
    "kind": "packet",
    "temperature": "hot"
  }
}
```

**Risk**: None. These 30 are verified packet-like structures.

### Tier 2: Keep Derived Artifacts in Sidecar (CORRECT)

**Non-mapped cards** (8,140):
- Store in `neschrom97-card-taxonomy.json` (3.79 MB, read-only)
- Include: card_id, card_hash, kind, path, confidence
- Do NOT push to Qdrant payloads (yet)
- Do NOT create Neo4j nodes (yet)

```json
{
  "card_id": "00077aad3e4544dd",
  "kind": "directory",
  "path": "sveltekit-frontend/src/lib/components",
  "confidence": 0.75,
  "tags": ["components", "types"],
  "som_cluster": 2
}
```

**Benefit**: Clear boundary between canonical + derived. No ambiguity.

### Tier 3: Build Cold-Evidence Lane for HyperRAG (FUTURE)

Once taxonomy is understood, HyperRAG can ask:
- "Show me directory topology context for this query" → 5,722 directory cards
- "Show me related features" → 1,617 feature cards
- "Show me packet alternatives" → 767 packet cards
- "Show me cluster neighbors" → 64 cluster cards

No forced canonicalization. Just evidence tiers.

---

## HyperRAG Envelope (New Design)

```typescript
{
  query: "ui component error handling",
  
  hotEvidence: {
    retrieval_strategy: "fusion",
    packets: [
      { packet_key: "pkt:error-analysis:v2", confidence: 0.94 }
    ]
  },
  
  warmEvidence: {
    features: [
      { feature_id: "error-analysis", packet_count: 5 }
    ],
    topology: {
      directory: "sveltekit-frontend/src/lib/components",
      som_cluster: 14
    }
  },
  
  coldEvidence: {
    neschrom97: {
      directories: [
        {
          card_id: "abc123",
          path: "sveltekit-frontend/src/lib/components",
          kind: "directory",
          confidence: 0.75
        }
      ],
      features: [
        {
          card_id: "def456",
          kind: "feature",
          feature_id: "error-analysis",
          confidence: 0.8
        }
      ],
      packets: [
        {
          card_id: "ghi789",
          kind: "packet",
          confidence: 0.9
        }
      ]
    }
  },
  
  trace: {
    telemetry_id: "...",
    latency_ms: 42,
    cache_hit: false
  }
}
```

Each tier is **separate, auditable, and has explicit provenance**.

---

## Why This Matters

### Before
- Force 8,170 cards into canonical graph → ambiguous authority
- Can't distinguish "packet" from "directory summary" → fuzzy retrieval
- All 8,170 treated equally → no quality signal

### After
- 30 verified packet matches → high authority (enrich immediately)
- 767 packet-like → medium authority (envelope as cold evidence)
- 5,722 directory + 1,617 feature → low authority (reference sidecar)
- Clear kind taxonomy → auditable classification

---

## Implementation Order (REVISED)

**Phase 3D: Retrieval Telemetry** (1-2 weeks)
- [ ] Wire retrieval_strategy field
- [ ] Instrument ACE, hybrid-search, RAG
- [ ] Collect >1,000 baseline queries

**Phase 3E.1: Card Taxonomy** (1 week) ✅ COMPLETE
- [x] Classify 8,170 cards
- [x] Generate taxonomy.json (3.79 MB)
- [x] Confirm derived artifact composition

**Phase 3E.2: Mapped Card Registry** (1 week)
- [ ] Enrich 30 mapped cards only
- [ ] Qdrant payload: { neschrom97: { card_id, card_hash, confidence, kind } }
- [ ] Zero risk (30 verified cards)

**Phase 3F: Sidecar Registry Strategy** (1 week)
- [ ] Define sidecar schema (card_id, kind, path, confidence, derived_from)
- [ ] Decide: keep in JSON or move to SeaweedFS
- [ ] Document retrieval strategy for cold evidence

**Phase 3G: Neo4j Lineage** (1 week)
- [ ] Create edges only for 30 mapped packets
- [ ] (Don't create nodes for 8,140 unverified cards)
- [ ] Link packet → feature → directory → community

**Phase 3H: HyperRAG Cold Lane** (2 weeks)
- [ ] Wire hotEvidence ← retrieval_telemetry
- [ ] Wire warmEvidence ← canonical packets + features
- [ ] Wire coldEvidence ← NESCHROM97 sidecar registry
- [ ] Return unified envelope (all tiers, explicit kind)

---

## Key Decisions

### What NOT to Do

❌ Don't force all 8,170 into Qdrant payloads  
❌ Don't create Neo4j nodes for unverified cards  
❌ Don't treat directory artifacts as packets  
❌ Don't merge sidecar into canonical graph  

### What to Do

✅ Enrich 30 mapped cards immediately (verified)  
✅ Keep 8,140 in read-only sidecar registry  
✅ Classify by kind (directory/feature/packet/cluster/unknown)  
✅ Build cold-evidence lane that respects separation  

---

## The Bottleneck is Now Clear

**Not**: "How do we match more cards?"  
**Yes**: "How do we use derived artifacts as evidence WITHOUT false canonicalization?"

NESCHROM97 is a **semantic evidence layer**, not a **packet index**. The architecture should reflect that.

---

## Files

| File | Size | Purpose |
|------|------|---------|
| `neschrom97-card-taxonomy.json` | 3.79 MB | Card classification (70% directory, 20% feature, 9% packet, 1% cluster) |
| `neschrom97-card-registry.json` | 7.33 MB | Replay index (all 8,170 cards, with registry confidence) |
| `classify-neschrom97-cards.mjs` | — | Taxonomy classifier (pure heuristics) |

---

## Next Session

1. **Phase 3D**: Wire retrieval_strategy field → start telemetry collection
2. **Phase 3E.2**: Enrich 30 mapped cards to Qdrant (safe, verified)
3. **Phase 3F**: Define sidecar registry strategy (how to store 8,140 non-packets)
4. **Phase 3G**: Neo4j edges for 30 only (don't create unverified nodes)
5. **Phase 3H**: Wire HyperRAG cold lane (unified envelope with explicit provenance)

The surprise insight: **Derived artifacts are more valuable than false canonicalization.**

---

**Architecture is now aligned with reality. Ready to build with confidence.**
