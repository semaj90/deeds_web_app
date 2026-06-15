# Phase Lane Completion

generated_at: 2026-06-05T20:01:37.528Z

## Status

- **parent_atlas_cards**: missing — .tmp\parent-atlas-profile-cards.jsonl
- **phase12_overlay**: present — docs\atlas\feature-registry.json
- **phase16_refresh_runner**: present — C:\Users\james\Videos\deeds-web-app\scripts\atlas\sourceRef-first-parent-atlas-refresh.mjs
- **phase16_refresh_report**: present — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-parent-atlas-refresh.md
- **phase17**: present — .tmp\phase17-pytorch-features.jsonl
- **phase18**: present — .tmp\phase18-xgboost-rerank.jsonl
- **hot_keyword_clusters**: missing — .tmp\hot-keyword-clusters.json
- **retrieval_loop_log**: present — .tmp\atlas-retrieval-loop.jsonl

## Workspace Roots

- workspaceRoot: `C:\Users\james\Videos\deeds-web-app`
- projectRoot: `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`
- template: `C:\Users\james\Videos\deeds-web-app\configs\templates\gemma4-opencode.jinja`
- template exists: `true`

## Phase 16 Refresh Promotion

- marker: phase16_refresh_promotion
- **sourceRef-first parent atlas refresh runner**: READY_TO_PROMOTE — C:\Users\james\Videos\deeds-web-app\scripts\atlas\sourceRef-first-parent-atlas-refresh.mjs
- **sourceRef-first parent atlas refresh report**: ALREADY_ACTIVE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-parent-atlas-refresh.md
- **sourceRef-first parent atlas refresh report json**: ALREADY_ACTIVE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-first-parent-atlas-refresh.json
- **sourceRef parent join dry run**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-dry-run.md
- **sourceRef parent join dry run json**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-dry-run.json
- **sourceRef parent join archive plan**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-archive-plan.md
- **sourceRef parent join archive plan json**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-archive-plan.json
- **sourceRef parent join archive move list**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-archive-move-list.md
- **sourceRef parent join archive move list json**: GENERATED_DO_NOT_PROMOTE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-parent-join-archive-move-list.json
- **sourceRef atlas join inventory**: ALREADY_ACTIVE — C:\Users\james\Videos\deeds-web-app\docs\reports\sourceRef-atlas-join-inventory.md
- **offline synthesis mapreduce duckdb report**: ALREADY_ACTIVE — C:\Users\james\Videos\deeds-web-app\docs\reports\offline-synthesis-mapreduce-duckdb-report.md

Next steps: keep the Phase 12 overlay aligned in `docs/atlas/feature-registry.json`, keep Phase 16 refresh promotion pointed at the canonical sourceRef-first join artifacts in the app workspace, then run `npm run atlas:phase17` and `npm run atlas:phase18` only if their outputs need refresh.
