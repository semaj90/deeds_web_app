# Parent Atlas QAS workstation implementation prompt

Use the actual local repo at `C:\Users\james\Videos\deeds-web-app`.

Do not trust stale GitHub mirrors. Read before editing.

## Objective
Implement `parent-atlas-query-adaptive-synthesis` as a read-only/shadow lane after Daily Graphify, reusing existing Parent Atlas owners.

## First commands
```powershell
cd C:\Users\james\Videos\deeds-web-app
git status --short
rg -n '"graphify:daily"|graphify:daily' sveltekit-frontend\package.json package.json
rg -n "ContextManifest|ExecutionReceipt|ValidationReceipt|AtlasRecommendation|RecommendationV1" sveltekit-frontend\src scripts docs openspec
rg -n "SOM|som_cluster|20x20|20 × 20|winnerCell|centroid" sveltekit-frontend\src scripts docs openspec
rg -n "BitFrost|Bifrost|ACE|residency|prefetch|reuseProbability" sveltekit-frontend\src scripts docs openspec
rg -n "tensorrt_bridge|libtorch-bridge|batchCosine|topK|softmax|PageRank|KMeans|SOM|PCA" sveltekit-frontend\src simd-bridge scripts
rg -n "materialize.*kanban|recommendation|policy.decision.receipt|analytics.observed" sveltekit-frontend\src scripts
```

## Required behavior
1. Run `scripts/atlas/qas/audit-qas-integration.mjs`.
2. Replace `run-qas-shadow.mjs` NOT_WIRED placeholders only with existing owners discovered above.
3. Do NOT add a second retrieval executor, second SOM, second ContextManifest, second recommendation schema, or second truth store.
4. Build feature rows from existing evidence producers.
5. Use the query-conditioned sampler only as a candidate reducer.
6. For every sampled candidate selected for final context, call the existing exact canonical lookup and mark `EXACT_PROMOTED` only after success.
7. Extend the existing ContextManifest/receipt rather than creating a competing request envelope.
8. Wire the shadow stage after a successful `graphify:daily` structural refresh.
9. If direct modification of `graphify:daily` would make the experimental lane block structural refresh, prefer the repo's existing post-stage/hook mechanism or add `graphify:daily:qas` as an opt-in wrapper first.
10. Add deterministic tests and exact-baseline comparison.

## Required reports
- `docs/reports/qas-owner-audit.json`
- `docs/reports/qas-owner-audit.md`
- `docs/reports/qas-daily-shadow.json`
- `docs/reports/qas-sampling-eval.json`

## Required evaluation
For fixtures and then a read-only real sample:
- exact candidate count
- sample budget
- recall@K
- overlap@K
- exact promotion success rate
- context token savings
- latency/compute delta where measurable
- no canonical writes
- Graphify revision linked to QAS policy/feature revision

## Stop conditions
Stop and report rather than inventing a new owner if any of these cannot be located:
- live Graphify revision
- canonical packet/symbol lookup
- ContextManifest/receipt owner
- SOM/domain artifact revision
- retrieval candidate contract

GRPO/PPO/GEPA/LoRA remain offline or shadow. No training and no adapter blending in this implementation slice.

## Final validation
```powershell
git diff --check
npm run test -- query-conditioned-sampler
npm run graphify:daily
node scripts/atlas/qas/audit-qas-integration.mjs
node scripts/atlas/qas/run-qas-shadow.mjs --json
```

Report:
- likely_cause
- evidence
- patch_targets
- safe_next_command
- smoke_command
- report_path
