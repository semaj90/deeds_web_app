# Lane Router Policy Evaluation Report

_Generated: 2026-05-17T16:49:15.987Z_

## Summary

| Metric | Value |
|---|---|
| Rows evaluated | 32 |
| Rows with `rerank_score` | ❌ 0 rows — `rerank_score` not yet propagated to chunk_hit_log |
| Accepted context rate | 5 / 32 (15.6%) |
| Policy rules in Redis | ❌ empty (run `npm run kb:lane-router:full`) |
| Policy coverage | 0 rows matched a policy key (0.0%) |
| Policy lane match rate | N/A% (policy recommended == actual pipeline) |
| Policy precision | N/A% (match AND accepted) |
| Score threshold | 0.5 |
| Conf threshold | 0.6 |

## ⚠️ Warnings

- chunk_hit_log has 0 rows with rerank_score — lane router training data is not yet meaningful. Fix: ensure rerankScore is propagated in context-assembler.ts recordChunkHits() calls.
- ace:lane:routing_policy is empty — run: npm run kb:lane-router:full

## Score Lift (policy recommendation vs no recommendation)

| Condition | Avg rerank | p95 rerank | Delta |
|---|---|---|---|
| Policy applied | N/A | N/A | — |
| Policy matched actual lane | N/A | N/A | — |

> **Positive delta** = policy-recommended lanes produced higher rerank scores (router is helping).
> **Zero/negative delta** = policy recommendations are not correlated with quality (needs more training data or rerank_score propagation).

## Per Topo-Label Breakdown

| Topo label | Rows | Accepted | Avg rerank | Policy rec | Dominant lane | Precision |
|---|---|---|---|---|---|---|
| `unclassified` | 32 | 5 (15.6%) | N/A | `—` | `ace` | — |

## Interpretation


### 🔴 No rerank_score data yet

The router cannot be meaningfully evaluated. **Next steps:**
1. Ensure `rerankScore` is propagated in `context-assembler.ts` `recordChunkHits()`
2. Run several ACE queries to populate `chunk_hit_log`
3. Re-run this evaluator: `node scripts/kb/eval-lane-router-policy.mjs`


## Files

- Eval report (JSON): `memory/kb/lane-router-eval-report.json`
- Policy JSON: `memory/kb/lane-router-policy.json`
- Redis key: `ace:lane:routing_policy` (0 rules)
- Training set: `memory/kb/lane-router-training-set.jsonl`

## Next actions

```bash
# Refresh scores with fixed attention calculation
npm run karpathy:gpu

# Retrain after chunk_hit_log accumulates rerank_scores
npm run kb:lane-router:full

# Re-evaluate
node scripts/kb/eval-lane-router-policy.mjs --limit 5000
```
