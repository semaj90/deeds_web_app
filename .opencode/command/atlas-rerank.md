Run read-only Atlas rerank flow.

Goal:
- Produce ranked sourceRefs using graph expansion + RotorQuant-style blend.
- Do not edit files.
- Do not run write tools.

Required order:
1. Validate refs with `opencode.inject_summary` input schema expectations (kind/trust/sourceRefs shape only; no persistence side effects in this command).
2. Call `graph.expand_neighborhood` with:
   - `sourceRefs`
   - `maxHops` (1 or 2)
   - `limit`
3. Call `turbovec.rank_chunks` with formula:
   - `finalScore = 0.45*vector + 0.25*graph + 0.20*trust + 0.10*recency`
4. Call `engram.chat_memory_recent` to fetch read-only memory context.
5. Return synthesis-ready packet only (no synthesis writeback).

Trust mapping:
- `local_verified` => `1.0`
- `external_verified` => `0.8`
- `synthetic` => `0.45`
- `web_unverified` => `0.25`

Return format:
- `rankedSourceRefs`: ordered list with finalScore
- `graphPaths`: expanded edge paths used for support
- `reasons`: one concise reason per ref
- `furtherResearch`: yes/no
- `memoryHints`: optional short list from engram recent memory

Hard constraints:
- Read-only operations only.
- No code edits.
- No DB/Redis/Qdrant/Neo4j writes.
- If inputs are invalid, return a validation error with suggested fixes.
