# OpenCode Command: Feature Map Build

This command executes the full MapReduce feature indexing pipeline to generate a compressed, semantic memory of the entire codebase, which is stored in the Feature Registry. This process transforms raw code into actionable, queryable context cards.

## Workflow Overview (MapReduce Cycle)
The process is executed in three non-linear stages:

1.  **Map Stage (`map:features`):** Scans all files and emits tiny, structured facts (JSONL format) based on predefined patterns (symbol, route, db, etc.). It does **not** read raw file contents into the LLM context.
2.  **Shuffle/Reduce Stage (`reduce:features`):** Groups the emitted facts by `featureKey` (e.g., "saved-citation-synthesis"). It merges these facts into high-level summary cards that detail the feature's scope, methods, and dependencies.
3.  **Index Stage (`index:features:qdrant`):** Indexes the resulting feature cards into Qdrant to enable semantic lookups, creating a persistent, queryable memory layer.

## Execution Steps
The pipeline must be run sequentially via the `feature:atlas` command:

1.  **Run `npm run feature:atlas`**: This orchestrates the full MapReduce cycle.
    ```bash
    npm run feature:atlas
    ```
2.  **Search Artifacts**: After running the command, subsequent queries **must** query the generated artifacts (Qdrant/Redis) rather than raw files.
3.  **Querying**: Use Qdrant/TurboVec tags for semantic lookup against the feature cards.
4.  **SourceGrounding**: The final summary must reference the feature cards and their originating `sourceRefs`.

## Command Structure
This workflow is implemented via the following scripts:
- `map:features`: Executes `tsx scripts/mapreduce/map-features.ts`.
- `reduce:features`: Executes `tsx scripts/mapreduce/reduce-features.ts`.
- `index:features:qdrant`: Executes `tsx scripts/mapreduce/index-features-qdrant.ts`.

**Action Command:**
Execute `npm run feature:atlas` to run all three steps in sequence.
