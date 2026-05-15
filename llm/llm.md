# llm

Repo-local context hub for agentic retrieval, ACE packet preparation, and KAG-style navigation.
Treat this as the repo's `llms.txt`-style context entrypoint for ingestion, ACE packet injection, 4D topology lookup, and Gemma4 tool-calling.

## Use this hub for

- Fast orientation before editing `sveltekit-frontend/`
- Agent context packing for ACE / KAG / timeline lookups
- Finding the right subpage without reading the whole repo

## Pages

- `llm_timeline.md` — append-only event log with timestamps
- `llm_inventory.md` — repo map, paths, languages, packages, module counts, feature counts
- `llm_intent.md` — what this directory is for and when to use it
- `llm_dependencies.md` — env, services, build/test entrypoints, and external dependencies
- `llm_recommendations.md` — current guidance and guardrails
- `llm_todos.md` — open follow-ups and next actions
- `karpathy_llmwiki.md` — master traversal page for ACE/Karpathy indexing, relevant scripts, and debug flow
- `repo_root_map.md` — workspace-root path map for Docker, services, bridges, workflows, and configs

## Rules

- Do not erase prior history; append new entries.
- Keep timestamps on every update.
- If a page already exists, update it in place and preserve prior content unless it is explicitly obsolete.
- Preserve the original `AGENTS.md` section shape when indexing directory context: `Snapshot`, `Files`, `Tools`, `Audit Gates`, `Todos + Enhancements`, `Retrieval / Rerank Hints`, and `Agentic tool-calling`.
- Treat those sections as the default parameters for llm-indexed directory cards unless a subtree has verified local overrides.
