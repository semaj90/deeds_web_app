# Session 184: Retrieval Pipeline Reranking Bug Fix

**Status:** 163 candidates → 0 reranked (CRITICAL BUG IDENTIFIED)

## Root Cause
The `rerankCanonicalFeatureEnvelopes()` function is throwing during reranking, and the error is silently caught and returns empty candidates.

## Files Modified
- `src/lib/server/retrieval/canonical-rerank-executor.ts`
  - Line 445: Fixed `n_concepts` reference to non-existent `candidate.content`
  - Line 708: Added error logging to catch block
  - Line 586: Wrapped `localFallbackRerank()` in try/catch with logging

## What We Know
1. ✅ Candidates ARE properly hydrated with ALL required fields:
   - `packetKey` (line 292)
   - `sourceRef` (line 293)
   - `content` (line 294, via `pickEnvelopeContent`)
   - `retrievedRank` (line 295)

2. ✅ The function `canonicalEnvelopeToRerankCandidate` at line 286 creates valid RerankCandidate objects

3. ❌ Yet reranking still returns 0 candidates

## Next Step to Diagnose
**Run this:**
```bash
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npm run dev
# In another terminal:
curl "http://127.0.0.1:5173/api/retrieval/search-unified?q=test&topK=3"
# Watch the first terminal for error logs
```

**Expected logs to appear:**
- Either: `[rerankCanonicalFeatureEnvelopes] reranker threw:`
- Or: `[runFallbackRerank] localFallbackRerank threw:`

**What to look for:**
- If `localFallbackRerank` threw: Check the stack trace for which step is failing
- Most likely: A `.localeCompare()` call on undefined (line 560 in sort function)

## Hypothesis
The candidates are passing validation, but `localFallbackRerank` is throwing during the `.sort()` operation at line 560 when `packetKey` is undefined on some candidates. This would mean `canonicalEnvelopeToRerankCandidate` is being called with invalid envelopes where `pickPacketKey()` returns undefined.

## Files to Check
1. `pickPacketKey()` function (around line 147-157) - verify it ALWAYS returns a non-empty string
2. The envelopes coming INTO `rerankCanonicalFeatureEnvelopes()` - do they have valid identifiers?

## Quick Fix (if pickPacketKey returns undefined)
```typescript
function pickPacketKey(envelope: CanonicalRerankEnvelope, fallbackIndex: number): string {
  const key = envelope.packet_key ?? envelope.feature_id ?? envelope.relative_path;
  if (!key) {
    console.warn('[pickPacketKey] envelope missing identity:', envelope);
    return `fallback-${fallbackIndex}-${Date.now()}`;  // Generate unique ID
  }
  return key;
}
```

---
**Session end:** Out of context. Resume by restarting dev server and checking the error logs.
