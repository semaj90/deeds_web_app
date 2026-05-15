# TODO Pt2 - Workspace Startup + GPU Indexing

## Goal
Map the workspace VS Code startup tasks, then keep GPU codebase indexing on one canonical path only.

## Findings
- Workspace startup tasks live in `/.vscode/tasks.json`.
- Frontend route/atlas tasks live in `sveltekit-frontend/.vscode/tasks.json`.
- The workspace auto-starts `Dev Server (GPU, detached)` on folder open.
- The GPU indexing loop is already covered by `graphify:daily`, `karpathy:gpu:insights`, and `index:graphrag:loop`.
- A workspace task now exposes `GraphRAG Index Loop (Dry-Run)` for manual preview.
- A workspace task now exposes `GraphRAG Index Loop` for manual execution.

## Rules
- Do not add a second folderOpen task for GPU codebase indexing.
- Do not duplicate `atlas:build` inside a second GPU indexing runner if the canonical loop already calls it.
- Reuse `create:todo` for TODO generation instead of creating another TODO writer.

## Next Actions
1. Use `GraphRAG Index Loop (Dry-Run)` before `GraphRAG Index Loop` when changing the pipeline.
2. Keep the real GPU indexing as a manual or scheduled step, not an auto-start duplicate.
3. Fold any new startup task into the existing workspace task file instead of adding another parallel path.
