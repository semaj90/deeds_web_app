# Safe next commands — no canonical data mutation

# 1. AST byte-boundary regression proof
cd C:\Users\james\Videos\deeds_web_app
python -m pytest python/test_miniforge_nlp_sidecar_v2_bytes.py -q

# If/when the span-compat module is restored:
python -m pytest `
  python/test_atlas_treesitter_span_compat.py `
  python/test_miniforge_nlp_sidecar_v2_bytes.py `
  -q

# 2. Corpus structural proof
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
$env:ATLAS_AST_PARITY_CORPUS_LIMIT='66'
npx vitest run `
  src/lib/server/atlas/indexing/structural-observation-v1.spec.ts `
  src/lib/server/atlas/indexing/structural-parity-comparator-v2.spec.ts
npx tsx scripts/atlas/prove-node-tree-sitter-corpus-parity-v2.mts

# 3. Static search for current regressions / stale active rules
cd C:\Users\james\Videos\deeds_web_app
rg -n "falls back to cpu|rank:pairwise|rank:ndcg|qid|QuantileDMatrix" `
  scripts/atlas/train-xgboost-reranker.py python

rg -n "codebase_chunks_384|384-dim|legal-ai-redis|legal_ai_redis" `
  AGENTS.md CLAUDE.md .cline .clinerules .claude

# 4. Read-only Graphify migration safety/preflight only
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
npx tsx scripts/atlas/audit-graphify-revision-migration-safety.mts
npx tsx scripts/atlas/prove-graphify-revision-migration-preflight.mts

# DO NOT apply migration against 127.0.0.1:5434 (proxy).

# 5. Targeted audit of broad retirement commit
cd C:\Users\james\Videos\deeds_web_app
git show --stat a2e4dab329a692a2107184aabd0983392a5ed9fc
git show --diff-filter=D --name-only a2e4dab329a692a2107184aabd0983392a5ed9fc

# Candidate restore inspection only; do not restore automatically
git show a2e4dab329^:python/atlas_treesitter_span_compat.py
git show a2e4dab329^:python/prove_atlas_xgboost_gpu_runtime_v1.py
git show a2e4dab329^:python/atlas_xgboost_grouped_ranking_v1.py
