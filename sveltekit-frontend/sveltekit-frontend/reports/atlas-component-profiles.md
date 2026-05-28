# Atlas Component Profiles
Generated: 2026-05-28T03:29:12.599Z

## Summary
Total profiles: 0

### Counts by kind

## Sample entries

## Next steps
- Review `.tmp/atlas-component-profiles.jsonl` for completeness
- Load into Postgres table `atlas_component_profiles` (schema: sourceRef TEXT PRIMARY KEY, payload JSONB)
- Index into Qdrant collection `atlas_component_profiles_768` with `embeddinggemma:latest`
- Cache hot items in Redis key `atlas:profiles:hot`

## Notes
- This scan uses heuristics. Manually review high-risk/native files for correctness.