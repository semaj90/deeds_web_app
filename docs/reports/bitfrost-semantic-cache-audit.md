# BitFrost / ACE / Karpathy Redis Cache Audit

Generated: 2026-09-26T22:55:48.014Z
Status: PASS_WITH_DRIFT
Redis Container: legal-ai-valkey

## Summary by ownership class

| Ownership | Families | Total keys |
|---|---:|---:|
| ACTIVE | 8 | 99 |
| ASPIRATIONAL | 13 | 3 |
| LEGACY | 2 | 23379 |
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
| `embed:v2:embeddinggemma:latest:*` | ACTIVE | 63 | embed:v2:embeddinggemma:latest:652192e08087cb09829cd6490f557ce51d7707c048fc9d63118f3f3ee875669b, embed:v2:embeddinggemma:latest:7c5956df8db3078f1be169af1deb65774bab391e0aa091415cb2886b3bc5c338, embed:v2:embeddinggemma:latest:5d64f3c7f55c13bc4cb4405d3f480bfc17cdd969f0223e2f1ad81034f034edb6, embed:v2:embeddinggemma:latest:686f4228b98904b281f4ebfb562d1f0045ec8451956bb148afe1dd95656160fd, embed:v2:embeddinggemma:latest:0cccf4769c1f4da3ba1fbad5337129a083ba24bd0473b7aed5b3ae033a3793d8 |  |
| `embed:embeddinggemma:latest:*` | LEGACY | 23379 | embed:embeddinggemma:latest:4223fde248b8715cc172b4756ba5954b, embed:embeddinggemma:latest:a945db00112fb09e4e1873821cc6c2c8, embed:embeddinggemma:latest:d4fb0f7b5656e96b674edac31f44ff72, embed:embeddinggemma:latest:89859603cdbbcd3f074927ebb7b969c5, embed:embeddinggemma:latest:915373f28c5da4c4aab1ea6924eeb2f8 |  |
| `ace:*` | ACTIVE | 36 | ace:chunk:hits:C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/routes/api/cases/__tests__/cases-schemas.test.ts, ace:source_ref:f8955f0f, ace:source_ref:23627406, ace:source_ref:2a7ba9c5, ace:source_ref:0dbba660 |  |
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
| `ace:feature:*` | ASPIRATIONAL | 3 | ace:feature:src.lib.server.cache-keys, ace:feature:src.lib.server.cache.atlas-reward-cache, ace:feature:src.lib.server.cache.redis-exact-match | UNEXPECTED_POPULATED: was documented as ASPIRATIONAL with 0 live rows; now has 3. Verify whether a writer was added and update this script's classification. |
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
- **ace:feature:***: UNEXPECTED_POPULATED: was documented as ASPIRATIONAL with 0 live rows; now has 3. Verify whether a writer was added and update this script's classification.

## Next Safe Action

7 ownership-class drift flag(s) found -- see the "Drift flags requiring attention" section before trusting this audit's classification.
