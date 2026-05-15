# TODO Pt3 - ACE Cache Indexing + Postgres/Qdrant

## Goal
Keep ACE cache indexing on one manual path that starts from Postgres chunk_id sync and ends in Qdrant cluster refresh.

## Canonical Path
- `npm run search:sync:pg`
- `npm run ace:hit-demand`
- `npm run qdrant:backfill-cluster-keys`
- `npm run graphify:semantic-cluster`
- `npm run graphify:cluster-pagerank`

## Rules
- Do not create a second cache-indexing pipeline for ACE.
- Reuse the existing Qdrant cluster-key and SOM scripts.
- Keep this off `folderOpen`; it should be manual or scheduled.

## Notes
- `search:sync:pg` is the Postgres chunk_id sync point.
- `ace:hit-demand` is the demand cache refresh.
- `ACE Cache Index Refresh` in VS Code should point at the single npm script only.
