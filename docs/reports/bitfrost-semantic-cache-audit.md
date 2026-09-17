# BitFrost / ACE / Karpathy Redis Cache Audit

Generated: 2026-09-17T04:10:44.233Z
Status: PASS_WITH_DRIFT
Redis Container: legal-ai-valkey

## Summary by ownership class

| Ownership | Families | Total keys |
|---|---:|---:|
| ACTIVE | 8 | 20 |
| ASPIRATIONAL | 13 | 0 |
| LEGACY | 2 | 26 |
| WARMED_PENDING | 4 | 0 |
| NAMING_DRIFT_CHECK | 1 | 0 |

## Families

| Key pattern | Ownership | Count | Sample | Drift flag |
|---|---|---:|---|---|
| `bitfrost:summary:packet:v1:*` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:som:packet:*` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:som:cell:*` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:autoencoder:latent_64:*` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:karpathy:scores` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:karpathy:summary` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:karpathy:encoded` | ASPIRATIONAL | 0 | none |  |
| `embed:v2:embeddinggemma:latest:*` | ACTIVE | 8 | embed:v2:embeddinggemma:latest:a34ee5577eaee625a11272319c333abec71d453a9cc6e56e548b7ddfa7f2a1da, embed:v2:embeddinggemma:latest:7fdbf2f7e97fe77abfa3b1191e40719930e715779c65caa3453f7c349ac525b7, embed:v2:embeddinggemma:latest:dcc2a68711ebefcb5a0eff9b5ca94f214e246fe480bbefb5e0bbd2afc293130b, embed:v2:embeddinggemma:latest:94d192b3a326be1f019b71ef13ea5a367ffe939c5e9a88f1b270e53753d9569a, embed:v2:embeddinggemma:latest:fbe762cea7a72c261c78c14a199f613e7049ffb1d7a807469a392af3f3f95d6c |  |
| `embed:embeddinggemma:latest:*` | LEGACY | 26 | embed:embeddinggemma:latest:2350cbfc386da93e6a372f8f3d4506c9, embed:embeddinggemma:latest:94d192b3a326be1f019b71ef13ea5a36, embed:embeddinggemma:latest:94d192b3a326be1f, embed:embeddinggemma:latest:db49d3005848d273c108473450f42289, embed:embeddinggemma:latest:71be871eb89d057b5c4b2bb413c743a8 |  |
| `ace:*` | ACTIVE | 12 | ace:chunk:hits:sveltekit-frontend/src/lib/server/db/migrate-test-rag.ts, ace:chunk:hits:C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/routes/api/cases/__tests__/cases-schemas.test.ts, ace:chunk:hits:C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\src\lib\data\phase82-route-consolidation.json, ace:chunk:hits:C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/routes/api/rag/search/__tests__/rag-search-schema.test.ts, ace:chunk:hits:C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/cache/__tests__/cache.test.ts |  |
| `bitfrost:candidate:v1:*` | WARMED_PENDING | 0 | none |  |
| `bitfrost:retrieval:v2:*` | WARMED_PENDING | 0 | none |  |
| `bitfrost:retrieval:*` | LEGACY | 0 | none |  |
| `bitfrost:ace:v1:*` | WARMED_PENDING | 0 | none |  |
| `bf:meta:v1:*` | WARMED_PENDING | 0 | none |  |
| `centroid:directory:*` | ASPIRATIONAL | 0 | none |  |
| `centroid:feature:*` | ASPIRATIONAL | 0 | none |  |
| `centroid:packet:*` | ASPIRATIONAL | 0 | none |  |
| `ace:context:*` | ASPIRATIONAL | 0 | none |  |
| `ace:summary:*` | ASPIRATIONAL | 0 | none |  |
| `ace:feature:*` | ASPIRATIONAL | 0 | none |  |
| `ace:query:*` | ASPIRATIONAL | 0 | none |  |
| `ace:tree:*` | ASPIRATIONAL | 0 | none |  |
| `ace:authority:*` | ASPIRATIONAL | 0 | none |  |
| `ace:ontology:*` | ASPIRATIONAL | 0 | none |  |
| `ace:memory:*` | ASPIRATIONAL | 0 | none |  |
| `reward:zset` | ASPIRATIONAL | 0 | none |  |
| `bifrost:*` | NAMING_DRIFT_CHECK | 0 | none |  |

## Drift flags requiring attention

- **bitfrost:summary:packet:v1:***: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **gpu:som:packet:***: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **gpu:som:cell:***: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **gpu:autoencoder:latent_64:***: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **gpu:karpathy:scores**: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **gpu:karpathy:summary**: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.

## Next Safe Action

6 ownership-class drift flag(s) found -- see the "Drift flags requiring attention" section before trusting this audit's classification.
