# Temporal Kanban Task State

> **Spine Join**: Parent Atlas remains the canonical join and index spine.
> **Generated**: 2026-07-03T04:05:35.044Z

---

## ⚡ READY FOR VERIFICATION


### [summary-semantics-0e5a48a27e4e] qdrant_payload_gap: migrations.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.7` | **Score**: `38`
- **Top Files**: `claude-mem/src/services/sqlite/migrations.ts`
- **Graph Neighbors**: 


### [summary-semantics-188d039288e2] qdrant_payload_gap: retrieval.100.jsonl
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.7` | **Score**: `38`
- **Top Files**: `benchmarks/retrieval-100.jsonl`
- **Graph Neighbors**: 


### [summary-semantics-a67f82f14aa6] qdrant_payload_gap: sync.marketplace.cjs
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.7` | **Score**: `38`
- **Top Files**: `claude-mem/scripts/sync-marketplace.cjs`
- **Graph Neighbors**: 


### [summary-semantics-0f522435204d] lexical_extraction_gap: schema.sql
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/sqlite/schema.sql`
- **Graph Neighbors**: 


### [summary-semantics-d21afb17ba2d] lexical_extraction_gap: observations.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/sqlite/Observations.ts`
- **Graph Neighbors**: 


### [summary-semantics-b71ce6fa1e08] lexical_extraction_gap: import.ts
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/sqlite/Import.ts`
- **Graph Neighbors**: 


### [summary-semantics-e87ed54c0d7e] lexical_extraction_gap: flushresponsethen.ts
- **Symptom**: `Lexical extraction is thin: nouns=13, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/server/flushResponseThen.ts`
- **Graph Neighbors**: 


### [summary-semantics-585e0429b743] lexical_extraction_gap: windsurfhooksinstaller.ts
- **Symptom**: `Lexical extraction is thin: nouns=14, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/integrations/WindsurfHooksInstaller.ts`
- **Graph Neighbors**: 


### [summary-semantics-8dfba18ab6d2] lexical_extraction_gap: telegramnotifier.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/integrations/TelegramNotifier.ts`
- **Graph Neighbors**: 


### [summary-semantics-8017bb058bd2] lexical_extraction_gap: geminiclihooksinstaller.ts
- **Symptom**: `Lexical extraction is thin: nouns=11, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/integrations/GeminiCliHooksInstaller.ts`
- **Graph Neighbors**: 


### [summary-semantics-25d6fb84d19c] lexical_extraction_gap: cleanupv12.4.3.ts
- **Symptom**: `Lexical extraction is thin: nouns=12, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/infrastructure/CleanupV12_4_3.ts`
- **Graph Neighbors**: 


### [summary-semantics-a1ff6e129635] lexical_extraction_gap: modemanager.ts
- **Symptom**: `Lexical extraction is thin: nouns=14, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/domain/ModeManager.ts`
- **Graph Neighbors**: 


### [summary-semantics-94190ab8672f] lexical_extraction_gap: tokencalculator.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/services/context/TokenCalculator.ts`
- **Graph Neighbors**: 


### [summary-semantics-4c2eaabf92c9] lexical_extraction_gap: license
- **Symptom**: `Lexical extraction is thin: nouns=21, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `sveltekit-frontend/.venv_turbovec/Lib/site-packages/numpy-2.4.4.dist-info/licenses/numpy/ma/LICENSE`
- **Graph Neighbors**: 


### [summary-semantics-0f48afde3384] lexical_extraction_gap: formatters.ts
- **Symptom**: `Lexical extraction is thin: nouns=16, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `llama-cpp-turboquant-gemma4/tools/server/webui/src/lib/constants/formatters.ts`
- **Graph Neighbors**: 


### [summary-semantics-82e549a96d34] lexical_extraction_gap: readme.ko.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.ko.md`
- **Graph Neighbors**: 


### [summary-semantics-b36eee4cfc16] lexical_extraction_gap: raw.ts
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/cli/adapters/raw.ts`
- **Graph Neighbors**: 


### [summary-semantics-404c9b38747e] lexical_extraction_gap: architecture.checkpoint.2026.06.11.md
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `ARCHITECTURE_CHECKPOINT_2026_06_11.md`
- **Graph Neighbors**: 


### [summary-semantics-a871d6f64602] lexical_extraction_gap: agents.md
- **Symptom**: `Lexical extraction is thin: nouns=21, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `AGENTS.md`
- **Graph Neighbors**: 


### [summary-semantics-da10fc0a69a4] lexical_extraction_gap: 6.27.todopt1.txt
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `6_27_todopt1.txt`
- **Graph Neighbors**: 


### [summary-semantics-f0a1164396ba] lexical_extraction_gap: 6.9.26.todo.txt
- **Symptom**: `Lexical extraction is thin: nouns=5, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `6_9_26_todo.txt`
- **Graph Neighbors**: 


### [summary-semantics-a6c5c7d382d0] lexical_extraction_gap: 6.26.26.todo.txt
- **Symptom**: `Lexical extraction is thin: nouns=14, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `6_26_26__todo.txt`
- **Graph Neighbors**: 


### [summary-semantics-7c80e795880f] lexical_extraction_gap: 6.26.26.todo.re.txt
- **Symptom**: `Lexical extraction is thin: nouns=5, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `6_26_26_todo_re.txt`
- **Graph Neighbors**: 


### [summary-semantics-44f562b59e32] lexical_extraction_gap: 6.23.26.todo.txt
- **Symptom**: `Lexical extraction is thin: nouns=11, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `6_23_26__todo.txt`
- **Graph Neighbors**: 


### [summary-semantics-7e45a3e5471f] lexical_extraction_gap: f5d26401.ui.nextsteps319.txt
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/f5d26401_ui_nextsteps319.txt`
- **Graph Neighbors**: 


### [summary-semantics-9982797e3d5b] lexical_extraction_gap: 51747cd2.drizzle.llms.txt
- **Symptom**: `Lexical extraction is thin: nouns=11, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/51747cd2_drizzle.llms.txt`
- **Graph Neighbors**: 


### [summary-semantics-c0f8eadc8196] lexical_extraction_gap: 4faa22d3.typescript.llms.full.txt
- **Symptom**: `Lexical extraction is thin: nouns=13, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/4faa22d3_typescript.llms-full.txt`
- **Graph Neighbors**: 


### [summary-semantics-7fd5ed56fe06] lexical_extraction_gap: 3a2cf9cb.svelte.llms.full.txt
- **Symptom**: `Lexical extraction is thin: nouns=12, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/3a2cf9cb_svelte.llms-full.txt`
- **Graph Neighbors**: 


### [summary-semantics-4045341ed0d0] lexical_extraction_gap: 1b3c0ab0.postgres.llms.txt
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/1b3c0ab0_postgres.llms.txt`
- **Graph Neighbors**: 


### [summary-semantics-e7b612ce2728] lexical_extraction_gap: 02e1f4e8.text.smoke.txt
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `archive/logs/02e1f4e8_text_smoke.txt`
- **Graph Neighbors**: 


### [summary-semantics-4603e11a8306] lexical_extraction_gap: architecture.spec.md
- **Symptom**: `Lexical extraction is thin: nouns=12, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `ARCHITECTURE_SPEC.md`
- **Graph Neighbors**: 


### [summary-semantics-1419e9bab95d] lexical_extraction_gap: atlas.trees.615.26.txt
- **Symptom**: `Lexical extraction is thin: nouns=20, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `atlas_trees_615_26.txt`
- **Graph Neighbors**: 


### [summary-semantics-d4316f145216] lexical_extraction_gap: marketplace.json
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/.agents/plugins/marketplace.json`
- **Graph Neighbors**: 


### [summary-semantics-a0ab7aaaca3a] lexical_extraction_gap: claude.mem.context.md
- **Symptom**: `Lexical extraction is thin: nouns=13, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/.agent/rules/claude-mem-context.md`
- **Graph Neighbors**: 


### [summary-semantics-0fa5a68c8e28] lexical_extraction_gap: dockerfile
- **Symptom**: `Lexical extraction is thin: nouns=14, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docker/claude-mem/Dockerfile`
- **Graph Neighbors**: 


### [summary-semantics-f31953f8abe4] lexical_extraction_gap: review.md
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/cursor-hooks/REVIEW.md`
- **Graph Neighbors**: 


### [summary-semantics-5de7d9972c07] lexical_extraction_gap: readme.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/cursor-hooks/README.md`
- **Graph Neighbors**: 


### [summary-semantics-ce58af21c883] lexical_extraction_gap: parity.md
- **Symptom**: `Lexical extraction is thin: nouns=19, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/cursor-hooks/PARITY.md`
- **Graph Neighbors**: 


### [summary-semantics-dea08f39c858] lexical_extraction_gap: project.ts
- **Symptom**: `Lexical extraction is thin: nouns=23, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/core/schemas/project.ts`
- **Graph Neighbors**: 


### [summary-semantics-c083d840b257] lexical_extraction_gap: windsurf.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/cli/adapters/windsurf.ts`
- **Graph Neighbors**: 


### [summary-semantics-4b79d9ebac63] lexical_extraction_gap: gemini.cli.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/cli/adapters/gemini-cli.ts`
- **Graph Neighbors**: 


### [summary-semantics-aab33061d004] lexical_extraction_gap: claude.code.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/cli/adapters/claude-code.ts`
- **Graph Neighbors**: 


### [summary-semantics-46710e5ce0fd] lexical_extraction_gap: viewer.bundle.js
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/plugin/ui/viewer-bundle.js`
- **Graph Neighbors**: 


### [summary-semantics-de9aaaaf22d7] lexical_extraction_gap: installer.js
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/install/public/installer.js`
- **Graph Neighbors**: 


### [summary-semantics-bed1309fd8a2] lexical_extraction_gap: run.batch.py
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/evals/swebench/run-batch.py`
- **Graph Neighbors**: 


### [summary-semantics-bbe5580902c5] lexical_extraction_gap: export.memories.ts
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/scripts/export-memories.ts`
- **Graph Neighbors**: 


### [summary-semantics-248ba76b4d88] lexical_extraction_gap: cwd.remap.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/scripts/cwd-remap.ts`
- **Graph Neighbors**: 


### [summary-semantics-4eacc123e1e8] lexical_extraction_gap: gemini.setup.mdx
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/public/cursor/gemini-setup.mdx`
- **Graph Neighbors**: 


### [summary-semantics-ce103821972f] lexical_extraction_gap: overview.mdx
- **Symptom**: `Lexical extraction is thin: nouns=18, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/public/architecture/overview.mdx`
- **Graph Neighbors**: 


### [summary-semantics-5ebdf673601f] lexical_extraction_gap: auth.ts
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/server/middleware/auth.ts`
- **Graph Neighbors**: 


### [summary-semantics-70b922746c24] lexical_extraction_gap: resources.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/server/mcp/resources.ts`
- **Graph Neighbors**: 


### [summary-semantics-e9b9ff23a1d9] lexical_extraction_gap: register.ts
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/server/mcp/register.ts`
- **Graph Neighbors**: 


### [summary-semantics-18fba2cbf946] lexical_extraction_gap: prompts.ts
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/server/mcp/prompts.ts`
- **Graph Neighbors**: 


### [summary-semantics-f3af6f78482f] lexical_extraction_gap: readme.zh.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.zh.md`
- **Graph Neighbors**: 


### [summary-semantics-1516a8b1dd38] lexical_extraction_gap: readme.zh.tw.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.zh-tw.md`
- **Graph Neighbors**: 


### [summary-semantics-ee4ec25417f7] lexical_extraction_gap: readme.vi.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.vi.md`
- **Graph Neighbors**: 


### [summary-semantics-0afa55a09586] lexical_extraction_gap: readme.ur.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.ur.md`
- **Graph Neighbors**: 


### [summary-semantics-deffaf81392e] lexical_extraction_gap: readme.uk.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.uk.md`
- **Graph Neighbors**: 


### [summary-semantics-25253094cd65] lexical_extraction_gap: readme.tr.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.tr.md`
- **Graph Neighbors**: 


### [summary-semantics-8b679536abc2] lexical_extraction_gap: readme.sv.md
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.sv.md`
- **Graph Neighbors**: 


### [summary-semantics-543c90242a1b] lexical_extraction_gap: readme.ru.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.ru.md`
- **Graph Neighbors**: 


### [summary-semantics-8e022601d4a1] lexical_extraction_gap: readme.pt.br.md
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.pt-br.md`
- **Graph Neighbors**: 


### [summary-semantics-d67442178ec8] lexical_extraction_gap: readme.pl.md
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.pl.md`
- **Graph Neighbors**: 


### [summary-semantics-216e2e7f3348] lexical_extraction_gap: readme.no.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.no.md`
- **Graph Neighbors**: 


### [summary-semantics-faa4b0371897] lexical_extraction_gap: readme.nl.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.nl.md`
- **Graph Neighbors**: 


### [summary-semantics-fcf5ceeee018] lexical_extraction_gap: readme.ja.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.ja.md`
- **Graph Neighbors**: 


### [summary-semantics-d5442b03c2e5] lexical_extraction_gap: readme.it.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.it.md`
- **Graph Neighbors**: 


### [summary-semantics-9acef4f02633] lexical_extraction_gap: readme.id.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.id.md`
- **Graph Neighbors**: 


### [summary-semantics-08abdd016b62] lexical_extraction_gap: readme.hu.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.hu.md`
- **Graph Neighbors**: 


### [summary-semantics-612635797dfb] lexical_extraction_gap: readme.hi.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.hi.md`
- **Graph Neighbors**: 


### [summary-semantics-9068cbba3283] lexical_extraction_gap: readme.he.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.he.md`
- **Graph Neighbors**: 


### [summary-semantics-cc1ea2e7ddfc] lexical_extraction_gap: readme.fr.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.fr.md`
- **Graph Neighbors**: 


### [summary-semantics-9f8020dc88e0] lexical_extraction_gap: readme.fi.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.fi.md`
- **Graph Neighbors**: 


### [summary-semantics-d74eb152ee25] lexical_extraction_gap: readme.el.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.el.md`
- **Graph Neighbors**: 


### [summary-semantics-5158db4f6592] lexical_extraction_gap: readme.de.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.de.md`
- **Graph Neighbors**: 


### [summary-semantics-bc14abf4ecb6] lexical_extraction_gap: readme.da.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.da.md`
- **Graph Neighbors**: 


### [summary-semantics-62a667c6dcaa] lexical_extraction_gap: readme.cs.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.cs.md`
- **Graph Neighbors**: 


### [summary-semantics-280efbbc6212] lexical_extraction_gap: readme.bn.md
- **Symptom**: `Lexical extraction is thin: nouns=6, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.bn.md`
- **Graph Neighbors**: 


### [summary-semantics-28bb75332e42] lexical_extraction_gap: readme.ar.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/README.ar.md`
- **Graph Neighbors**: 


### [summary-semantics-f014014c2827] lexical_extraction_gap: pt.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/i18n/pt.md`
- **Graph Neighbors**: 


### [summary-semantics-7118a97dbfb4] lexical_extraction_gap: windows.spaces.issue.md
- **Symptom**: `Lexical extraction is thin: nouns=14, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/bug-fixes/windows-spaces-issue.md`
- **Graph Neighbors**: 


### [summary-semantics-fbd6e3621923] lexical_extraction_gap: api.md
- **Symptom**: `Lexical extraction is thin: nouns=7, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/docs/api.md`
- **Graph Neighbors**: 


### [summary-semantics-ce5823c944b0] lexical_extraction_gap: dockerfile.test.installer
- **Symptom**: `Lexical extraction is thin: nouns=17, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/Dockerfile.test-installer`
- **Graph Neighbors**: 


### [summary-semantics-f0bd1d8a99d9] lexical_extraction_gap: server.beta.service.cjs
- **Symptom**: `Lexical extraction is thin: nouns=10, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/plugin/scripts/server-beta-service.cjs`
- **Graph Neighbors**: 


### [summary-semantics-a446d0b55290] lexical_extraction_gap: sessionsobservationsadapter.ts
- **Symptom**: `Lexical extraction is thin: nouns=11, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/server/compat/SessionsObservationsAdapter.ts`
- **Graph Neighbors**: 


### [summary-semantics-85de6fbbd916] lexical_extraction_gap: uninstall.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/commands/uninstall.ts`
- **Graph Neighbors**: 


### [summary-semantics-d7eaa4254a06] lexical_extraction_gap: server.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/commands/server.ts`
- **Graph Neighbors**: 


### [summary-semantics-46fd0736d1b2] lexical_extraction_gap: install.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/commands/install.ts`
- **Graph Neighbors**: 


### [summary-semantics-ee9ae55fe310] lexical_extraction_gap: ide.detection.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/commands/ide-detection.ts`
- **Graph Neighbors**: 


### [summary-semantics-5767b9d777ad] lexical_extraction_gap: banner.ts
- **Symptom**: `Lexical extraction is thin: nouns=8, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/banner.ts`
- **Graph Neighbors**: 


### [summary-semantics-f19cb1cfd95e] lexical_extraction_gap: banner.frames.ts
- **Symptom**: `Lexical extraction is thin: nouns=9, verbs=0.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npx tsx sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts --limit 500; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `37`
- **Top Files**: `claude-mem/src/npx-cli/banner-frames.ts`
- **Graph Neighbors**: 


### [summary-semantics-6809f6f8f09b] qdrant_payload_gap: timelinerenderer.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.75` | **Score**: `34`
- **Top Files**: `claude-mem/src/services/context/sections/TimelineRenderer.ts`
- **Graph Neighbors**: 


### [summary-semantics-28760d25b7b2] qdrant_payload_gap: file.reader.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.75` | **Score**: `34`
- **Top Files**: `$lib/utils/file-reader.ts`
- **Graph Neighbors**: 


### [summary-semantics-febf69a9247d] qdrant_payload_gap: audit.4.layers.sh
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.75` | **Score**: `34`
- **Top Files**: `audit-4-layers.sh`
- **Graph Neighbors**: 


### [summary-semantics-bfeb9de71896] qdrant_payload_gap: collector.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.75` | **Score**: `34`
- **Top Files**: `claude-mem/scripts/bug-report/collector.ts`
- **Graph Neighbors**: 


### [summary-semantics-8c56941c7238] qdrant_payload_gap: runner.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.8` | **Score**: `31`
- **Top Files**: `claude-mem/src/services/sqlite/migrations/runner.ts`
- **Graph Neighbors**: 


### [summary-semantics-e9c9683e3733] qdrant_payload_gap: gitignore
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.82` | **Score**: `30`
- **Top Files**: `claude-mem/cursor-hooks/.gitignore`
- **Graph Neighbors**: 


### [summary-semantics-1c5e7016801e] qdrant_payload_gap: 6.22.26.txt
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.82` | **Score**: `30`
- **Top Files**: `6_22_26___.txt`
- **Graph Neighbors**: 


### [summary-semantics-ecab02f518df] qdrant_payload_gap: store.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.85` | **Score**: `28`
- **Top Files**: `claude-mem/src/services/sqlite/prompts/store.ts`
- **Graph Neighbors**: 


### [summary-semantics-6956b34e3a24] qdrant_payload_gap: store.ts
- **Symptom**: `Packet semantics are not linked to a Qdrant payload point.`
- **Root Cause**: Indexed summaries need ACE labels, lexical terms, graph authority, and mirror payloads before agentic search can reliably route repair tasks.
- **Recommended Command**: `npm run atlas:qdrant:tag-mirror:apply; npm run atlas:summary:index:rank -- --limit=500 --top-k=50; npm run atlas:workstation:summary-semantics`
- **Confidence**: `0.85` | **Score**: `28`
- **Top Files**: `claude-mem/src/services/sqlite/observations/store.ts`
- **Graph Neighbors**: 


---

## 🛑 BLOCKED

*No blocked tasks.*

---

## ✅ COMPLETED / VERIFIED


### [rec-task-0001] fix qdrant 64d mismatch
- **Symptom**: `Qdrant vector size mismatch: expected 768, got 64`
- **Verification Command**: `node scripts/atlas/smoke-turbovec-ann.mjs`
- **Status**: **VERIFIED**


### [rec-task-0002] warm turbovec centroids
- **Symptom**: `Loaded 0 centroids from Redis`
- **Verification Command**: `node -e "import('ioredis').then(({Redis}) => { const r = new Redis('redis://:redis@127.0.0.1:6379'); r.exists('gpu:autoencoder:centroids_64').then(e => console.log('centroids exist:', e)).then(()=>r.disconnect()) })"`
- **Status**: **VERIFIED**


### [rec-task-0003] add retrieval telemetry to hyperrag rpc
- **Symptom**: `Missing retrieval telemetry logs in packet-rpc responses`
- **Verification Command**: `npm run smoke:hyperrag-packet-rpc`
- **Status**: **VERIFIED**


### [rec-task-0004] return replay_trace from search and packet-rpc
- **Symptom**: `Replay trace summary is status: failed with queryCount: 0`
- **Verification Command**: `npm run smoke:hyperrag-packet-rpc`
- **Status**: **VERIFIED**


### [rec-task-0005] add multi-hop recommendation smoke test
- **Symptom**: `Harnesses remain mostly planned and untested`
- **Verification Command**: `npm run atlas:recommendations:replay`
- **Status**: **VERIFIED**


### [rec-task-20372fda] qdrant 64d mismatch
- **Symptom**: `test_error`
- **Verification Command**: `npm run smoke:hyperrag-packet-rpc`
- **Status**: **VERIFIED**

