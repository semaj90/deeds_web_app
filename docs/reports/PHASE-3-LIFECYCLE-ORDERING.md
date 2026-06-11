# Phase 3 Completion: Why the Order Matters

**Date**: 2026-06-11  
**Decision**: Telemetry BEFORE policy  
**Authority**: Evidence-driven architecture

---

## The Problem

You have structural temperature (Phase 3C):

```
HOT:  9,484 packets (live in frequently-accessed directories)
WARM:   427 packets (live in occasionally-accessed directories)
COLD:     0 packets (none old enough yet)
```

But you do NOT have behavioral temperature:

```
HOT:  ??? packets (actually retrieved >5 times in 7 days by users/agents)
WARM: ??? packets (actually retrieved 1-5 times in 7 days)
COLD: ??? packets (actually retrieved 0 times in 7 days)
```

**The gap**: A packet living in `src/lib/server/` (frequently-accessed directory) is not necessarily a packet that users retrieve. It might be:
- Dead code (never imported)
- Dead function (imported but never called)
- Scaffolding (exists but has no consumers)

---

## Why Telemetry First

**Phase 3D (Telemetry)** answers: "What do users actually retrieve?"

Once you know that, the next phases become evidence-driven:

### Phase 3E (Eval Harness)
- Measures: precision, recall, latency, fusion effectiveness
- **Needs telemetry to**: Compare your metrics against real usage patterns
- **Decision**: Is evaluation harness performing well *for the queries users actually make*?

### Phase 3F (Feature Governance)
- Analyzes: feature_id lifecycle (dead features, oversized features, underused features)
- **Needs telemetry to**: Identify features users *actually never retrieve*
- **Without telemetry**: You might archive a feature you think is dead but is actually used
- **With telemetry**: You archive only features with 0 retrievals in 30 days

### Phase 3G (Cache Policy)
- **Current logic** (Phase 3C): "Packets in frequent directories are HOT"
- **Better logic** (after 3D): "Packets retrieved >5 times in 7 days are HOT"
- **Without telemetry**: You cache packets that don't matter, miss packets users retrieve constantly
- **With telemetry**: Cache policy is pinned to actual usage

### Phase 3H (SeaweedFS Automation)
- **Current logic**: "Archive packets marked COLD"
- **Better logic** (after 3D): "Archive packets with 0 retrievals in 30 days"
- **Without telemetry**: You might archive live packets, keep dead ones
- **With telemetry**: Archive decisions are backed by proof

---

## Reversed Order (WRONG)

If you implement Phase 3G (Cache Policy) before Phase 3D (Telemetry):

```
Phase 3C (Structural Temp) → Phase 3G (Cache Policy)
                              ↓
                    HOT packets from struct go to Redis
                    (some are dead code, never retrieved)
                              ↓
                    WEEKS LATER...
                    
Phase 3D (Telemetry) → CONFLICT
                      "Wait, this packet is marked HOT in Redis
                       but was never retrieved by anyone."
                              ↓
                    Rework cache policy
                    Rebuild Redis hot cache
                    Re-learn what's actually HOT
```

---

## Correct Order (THIS SEQUENCE)

```
Phase 3D (Telemetry)
    ↓ (collects 1,000+ queries)
    ↓ (identifies behavioral temperature)
    ↓
    "These features are actually retrieved >5 times/week"
    "These packets are never retrieved"
    ↓
Phase 3E (Eval Harness) — validates quality against real usage
    ↓
Phase 3F (Feature Governance) — archives features with 0 retrievals
    ↓
Phase 3G (Cache Policy) — defines HOT/WARM/COLD from telemetry
    ↓
Phase 3H (SeaweedFS Automation) — archives based on retrieval count
```

Each phase builds on evidence from the previous one.

---

## Key Insight

**Structural temperature is a model. Behavioral temperature is reality.**

Models are useful for planning, but they can be wrong. You verify them with data. Once you have data, you let data drive decisions.

- **Before telemetry**: "This directory is frequently accessed, so packets in it are probably HOT"
- **After telemetry**: "This packet was retrieved 0 times this week; archive it"

The difference is evidence vs. intuition.

---

## Dependencies Chain

```
Phase 3D
    │ (produces retrieval_telemetry table)
    │ (identifies behavioral HOT/WARM/COLD)
    ├─→ Phase 3E (uses telemetry to validate eval metrics)
    ├─→ Phase 3F (uses retrieval_count to identify dead features)
    ├─→ Phase 3G (redefines HOT/WARM/COLD from retrieval patterns)
    │       │
    │       └─→ Phase 3H (archives COLD packets: 0 retrievals in 30 days)
```

**Critical path**: 3D → 3G → 3H  
**Parallel**: 3D → 3E, 3D → 3F

You cannot skip 3D. All other phases depend on it.

---

## What You're NOT Doing Yet

❌ **Do NOT** automate Redis promotion — need telemetry first  
❌ **Do NOT** schedule WARM packet eviction — need telemetry first  
❌ **Do NOT** archive COLD packets — need telemetry first  

The HOT/WARM/COLD tiers from Phase 3C are placeholder. Once Phase 3D data exists, the real tiers emerge from behavior.

---

## Timeline

```
Week 1–2: Phase 3D
          → Wire telemetry capture
          → Collect 1,000+ queries
          → Identify behavioral temperature

Week 3:   Phase 3E + 3F (parallel)
          → Run eval harness with real queries
          → Audit features with 0 retrievals

Week 4:   Phase 3G + 3H
          → Redefine HOT/WARM/COLD from telemetry
          → Auto-archive COLD (0 retrievals in 30 days)

Week 5+:  Continuous improvement
          → Telemetry feeds all future tuning
```

---

## Bottom Line

**Telemetry is the foundation. Everything else is built on top.**

You don't guess at caching policy, feature lifecycle, or archival thresholds. You measure, observe, and let data inform decisions.

Phase 3D is the inflection point where Parent Atlas stops being a structure and becomes an observable system.
