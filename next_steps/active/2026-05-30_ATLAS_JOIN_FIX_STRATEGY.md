# Atlas Join Fix: sourceRef ↔ Card Contract Resolution

**Status**: BLOCKER ANALYSIS (Phase 19D dependency)  
**Generated**: 2026-05-30T03:00:00Z  
**Priority**: HIGHEST (Blocks reward attribution, vector64, LoRA)

---

## Problem Summary

**Outcome Ledger → Card Join: 0/6 matches (0% success rate)**

| Layer | Example | Count |
|-------|---------|-------|
| **Outcome Ledger** | `sveltekit-frontend/src/lib/server/cache/cache-config.ts` | 6 rows |
| **Card Inventory** | `docs\documents-atlas-index.md#chunk-1258` | 9,372 cards |
| **Mapped Cards** | Cards with sourceRef | 1,379 cards (15%) |
| **Join Success** | Matching ledger → card | 0/6 (0%) |

**Root Cause**: 
- Outcome ledger tracks **code file edits** (actual source files)
- Card inventory is **7993 unmapped + 1379 document chunks** (no code origin tracking)
- No bidirectional linking between outcome events and source artifacts

---

## Current Sourceref Distribution (9,372 Cards)

```
Document chunks (docs\documents-atlas-index.md#chunk-*)  ~7993 cards (85%)
  └─ No source code origin
  └─ No reward attribution path

Cards with sourceRef (~1379 cards, 15%)
  ├─ docs\documents-*.md#chunk-*                         ~1000 cards
  ├─ sveltekit-frontend/src/...                          0 cards (!)
  ├─ scripts/atlas/...                                  ~300 cards
  └─ Other                                              ~79 cards

No sourceRef (Unmapped)                                  ~7993 cards
  └─ Titles only (e.g., "Your Mission", "Test from host")
  └─ No join path
```

**Critical finding**: 
- Outcome ledger references **code source files** (cache-config.ts)
- But card inventory has **0 code-sourced cards** (all document chunks or unmapped)
- This is a **fundamental schema mismatch**, not a join key bug

---

## Why This Happened

**Card generation pipeline**:
1. Document chunks → cards (works, 1000+ document cards)
2. Code analysis → cards (broken/missing, 0 code cards)
3. Feature registry → cards (Phase 19B generates tasks, but not card objects)
4. Retrieval outcomes → cards (outcome ledger points to code, but no card captures that)

**Result**: Cards are document-centric, outcome ledger is code-centric.

---

## Fix Strategy (4 Options)

### Option A: Backfill Code Cards from Outcome Ledger (FASTEST)

**Idea**: Use outcome ledger as source of truth for code artifacts.

```javascript
// For each outcome row with a sourceRef:
for (const row of outcomeledger) {
  for (const sourceRef of row.sourceRefs) {
    const cardId = sha256(sourceRef + row.graphVersion);
    const newCard = {
      id: cardId,
      sourceRef: sourceRef,
      graphVersion: row.graphVersion,
      title: path.basename(sourceRef),
      kind: 'code-artifact',
      origin: 'outcome-ledger',
      // Capture outcome signal
      avgReward: rows[sourceRef].map(r => r.reward).reduce((a,b) => a+b) / rows[sourceRef].length,
      outcomeCount: rows[sourceRef].length,
    };
    // Write to .opencode/cards/{cardId}.json
  }
}
```

**Effort**: 2-3 hours  
**Risk**: Low (additive only)  
**Benefit**: Immediate join success for code artifacts + reward attribution begins

---

### Option B: Enhance Card Generation Pipeline (ROBUST)

**Idea**: Wire code analysis into card generator.

```javascript
// In existing card generation:
// 1. Document chunks → cards (existing)
// 2. Code AST scan → cards (ADD THIS)
//    - Each function/export → card
//    - Include sourceRef + line numbers
// 3. Feature registry → cards (ADD THIS)
//    - Each feature → card with sourceRef list
// 4. Outcome events → cards (ADD THIS, ties to A)
```

**Effort**: 1-2 weeks  
**Risk**: Medium (touches card generation)  
**Benefit**: Cards become code-first, long-term solution

---

### Option C: Duplicate Outcome Data as Document Cards (SIMPLEST)

**Idea**: Treat outcome records as pseudo-documents.

```javascript
// For each outcome row:
const card = {
  id: sha256(outcomeId),
  sourceRef: outcome.sourceRefs[0],
  title: `Outcome: ${outcome.tool} on ${basename(outcome.sourceRefs[0])}`,
  kind: 'outcome-artifact',
  reward: outcome.reward,
  timestamp: outcome.timestamp,
};
// Write to .opencode/cards/{cardId}.json
```

**Effort**: 1-2 hours  
**Risk**: Very low  
**Benefit**: Immediate join for outcome events

---

### Option D: Create Separate Code Card Registry (CLEAN)

**Idea**: Don't force code cards into document card system.

```
.opencode/
  ├── cards/              (existing, document chunks)
  ├── code-cards/        (NEW, code artifacts)
  │   └── cache-config-ts.json
  │   └── fix-join.mjs
  └── outcome-cards/     (NEW, outcome events)
      └── outcome-{id}.json
```

**Effort**: 1 week  
**Risk**: Low (separate system)  
**Benefit**: Clean separation, easier to reason about

---

## Recommendation: Option A + C (Hybrid)

**Phase 1 (Today)**: 
- Backfill 6 outcome-related code cards from outcome ledger (Option C)
- Enables immediate testing of join + reward attribution

**Phase 2 (Next week)**:
- Enhance card generation pipeline (Option B)
- Make code cards first-class in inventory

---

## Implementation: Phase 1 (2-3 Hours)

### Step 1: Backfill Code Cards from Outcome Ledger

```javascript
// scripts/atlas/backfill-code-cards.mjs
import fs from 'fs';
import crypto from 'crypto';

const ledger = JSON.parse(fs.readFileSync('.opencode/outcome-ledger.ndjson'));
const cardsDir = '.opencode/cards';

const sourceRefsByPath = {};
for (const row of ledger) {
  for (const sourceRef of row.sourceRefs) {
    const normalized = sourceRef.replace(/\\/g, '/');
    if (!sourceRefsByPath[normalized]) {
      sourceRefsByPath[normalized] = {
        outcomes: [],
        outcomeCount: 0,
        avgReward: 0,
      };
    }
    sourceRefsByPath[normalized].outcomes.push(row);
    sourceRefsByPath[normalized].outcomeCount++;
    sourceRefsByPath[normalized].avgReward += row.reward;
  }
}

// Create card for each unique sourceRef
for (const [sourceRef, data] of Object.entries(sourceRefsByPath)) {
  data.avgReward /= data.outcomeCount;
  const cardId = crypto.createHash('sha256').update(sourceRef + '2026-05-30').digest('hex').slice(0, 16);
  
  const card = {
    id: cardId,
    sourceRef: sourceRef,
    title: `[Code] ${sourceRef.split('/').pop()}`,
    kind: 'code-artifact',
    origin: 'outcome-ledger',
    outcomeCount: data.outcomeCount,
    avgReward: data.avgReward,
    outcomes: data.outcomes.map(o => ({ id: o.id, reward: o.reward })),
  };
  
  fs.writeFileSync(`${cardsDir}/${cardId}.json`, JSON.stringify(card, null, 2));
}

console.log(`Backfilled ${Object.keys(sourceRefsByPath).length} code cards`);
```

### Step 2: Re-run Join Fix Script

```bash
npm run atlas:fix-joins:apply
```

Expected output:
```
  Matched: 6/6 (100%)
  Join success rate: 100.0%
```

### Step 3: Export Performance Metrics

```bash
# Load into DuckDB for analysis
duckdb :memory: << SQL
CREATE TABLE sourceRef_perf AS
  SELECT * FROM read_json_auto('memory/exports/sourceRef-performance.json');
  
SELECT sourceRef, outcomeCount, avgReward 
FROM sourceRef_perf 
ORDER BY avgReward DESC;
SQL
```

---

## DuckDB Analytics Readiness

Once joins are fixed, DuckDB can answer:

```sql
-- Tool performance
SELECT tool, COUNT(*) as uses, AVG(reward) as avg_reward
FROM outcome_ledger
GROUP BY tool
ORDER BY avg_reward DESC;

-- SourceRef performance (reward attribution)
SELECT sourceRef, COUNT(*) as edits, AVG(reward) as avg_reward
FROM outcome_ledger
JOIN sourceRef_cardId_map USING (sourceRef)
GROUP BY sourceRef
ORDER BY avg_reward DESC;

-- Cluster performance (when SOM clustering wired)
SELECT clusterId, COUNT(*) as members, AVG(reward) as cluster_reward
FROM code_cards
WHERE clusterId IS NOT NULL
GROUP BY clusterId
ORDER BY cluster_reward DESC;
```

---

## Timeline

| Task | Duration | Blocker | Output |
|------|----------|---------|--------|
| **Option A: Backfill code cards** | 2-3 hours | None | 6 code cards |
| **Re-run join fix** | 30 min | Backfill | sourceRef-performance.json |
| **DuckDB analytics test** | 1 hour | Join fix | Performance metrics |
| **Outcome ledger enrichment** | 1 hour | Join fix | outcome-ledger-with-cardIds.ndjson |
| **Reward attribution wiring** | 4 hours | Outcome enrichment | cardId → reward mapping |

**Critical path**: Backfill → Join fix → Reward attribution (6-7 hours total)

---

## Then Unblock Next Phases

```
sourceRef ↔ card join FIXED
    ↓
Outcome Ledger joins work
    ↓
Reward attribution works
    ↓
Cluster attribution works
    ↓
Vector64 dry-run works
    ↓
SOM clustering works
    ↓
LoRA dataset generation works
```

---

## Decision Point

**Proceed with Option A (Backfill) now?**

If yes:
```bash
npm run atlas:backfill-code-cards
npm run atlas:fix-joins:apply
# Test joins
```

If no, what's blocking?
- Missing cards in inventory?
- Different outcome ledger schema?
- sourceRef normalization issue?

---

**Current Status**: Ready to backfill. Option A is the fastest path to join success.