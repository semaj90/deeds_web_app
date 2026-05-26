# NanoFlow / BitFrost Logical Cache

This stack uses logical context reuse, not raw KV persistence.

## Read order

1. Redis `ace:ctx:{cacheKey}`
2. Postgres `llm_context_cache`
3. Local JSON `.cache/ace/context-packs/{cacheKey}.json`
4. Miss

## Cache contract

- `toolPolicy` must survive roundtrip.
- Local JSON corrupt data returns miss.
- Retrieval must continue even when cache read fails.
- TurboQuant text lanes keep draft enabled.
- VLM and mmproj-style requests disable draft.

## Operator checks

- `npm run ace:context-pack:smoke`
- `npm run ace:context-pack:metrics:smoke`
- `npm run ace:draft-policy:smoke`
- `npm run cache:ace:prune:dry`
