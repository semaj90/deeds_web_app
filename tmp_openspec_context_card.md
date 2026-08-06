OpenSpec Context Card

Change Latest commit Updated 2026-08-05
Status active
Objective Derive human-readable feature labels from summaries, paths, and title_ids instead of using bare basenames
Incomplete Tasks Feature Label Semantic Derivation Phase 1-4 not started; Manual Migration Reconciliation Tier B/C deferred; KV-Cache Adaptation Stage 1-2 pending build; TRT-LLM Readiness all gates NOT_PROVEN
Current Decisions Non-mutation guarantee for feature_label; deriveFeatureIdentity pure function; 6 derivation priority steps
Acceptance Gates All 11 fanout steps verified; 22/22 dry/apply pairs exist; apply-through-3 proven
Relevant Files scripts/atlas/lib/derive-feature-identity.mjs; scripts/atlas/summary-index-ranker.mjs; docs/reports/summary-index-ranker.json
Blockers None identified
Next Action Create derive-feature-identity.mjs with pure function implementing 6-step derivation chain
