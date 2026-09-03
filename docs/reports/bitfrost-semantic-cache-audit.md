# BitFrost / ACE / Karpathy Redis Cache Audit

Generated: 2026-09-03T02:04:15.292Z
Status: PASS_WITH_DRIFT
Redis Container: legal-ai-valkey

## Summary by ownership class

| Ownership | Families | Total keys |
|---|---:|---:|
| ACTIVE | 8 | 10130 |
| ASPIRATIONAL | 13 | 0 |
| LEGACY | 2 | 1 |
| WARMED_PENDING | 4 | 0 |
| NAMING_DRIFT_CHECK | 1 | 46 |

## Families

| Key pattern | Ownership | Count | Sample | Drift flag |
|---|---|---:|---|---|
| `bitfrost:summary:packet:v1:*` | ACTIVE | 4826 | bitfrost:summary:packet:v1:packet:071520fc354f, bitfrost:summary:packet:v1:packet:0575b5e4ae5c, bitfrost:summary:packet:v1:packet:07353c860b36, bitfrost:summary:packet:v1:packet:cf817dc6a6e9, bitfrost:summary:packet:v1:packet:29c2aa326d74 |  |
| `gpu:som:packet:*` | ACTIVE | 5000 | gpu:som:packet:1441, gpu:som:packet:128, gpu:som:packet:4841, gpu:som:packet:2016, gpu:som:packet:633 |  |
| `gpu:som:cell:*` | ACTIVE | 296 | gpu:som:cell:18:3, gpu:som:cell:2:18, gpu:som:cell:14:8, gpu:som:cell:1:8, gpu:som:cell:12:0 |  |
| `gpu:autoencoder:latent_64:*` | ACTIVE | 0 | none | UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed. |
| `gpu:karpathy:scores` | ACTIVE | 1 | gpu:karpathy:scores |  |
| `gpu:karpathy:summary` | ACTIVE | 1 | gpu:karpathy:summary |  |
| `gpu:karpathy:encoded` | ASPIRATIONAL | 0 | none |  |
| `embed:v2:embeddinggemma:latest:*` | ACTIVE | 4 | embed:v2:embeddinggemma:latest:ddc1ba0424a7319cd51df5572f2abb6b502cf4141789cf165c7552a4d406585a, embed:v2:embeddinggemma:latest:6bd35c5d44ccb95707b7d54f7f530a05579dcda94994c1f55fc1e0fbe2e03eed, embed:v2:embeddinggemma:latest:8e6565b4d5aed79ca0dff3fad3b2ce706e3b152494a629e4e1a9fe4dcb7e3525, embed:v2:embeddinggemma:latest:edf32a02ab001aa2b7e13927d5f0d5a8862efa786a669265b80ac0b1f280a558 |  |
| `embed:embeddinggemma:latest:*` | LEGACY | 1 | embed:embeddinggemma:latest:edf32a02ab001aa2 |  |
| `ace:*` | ACTIVE | 2 | ace:path:cluster:1, ace:cluster:members:unclassified:community-26562 |  |
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
| `bifrost:*` | NAMING_DRIFT_CHECK | 46 | bifrost:sem:packet:1703d9c005252a62, bifrost:sem:packet:packet:0004b466d863, bifrost:sem:feature:simd-bridge.LLMS, bifrost:sem:packet:packet:0009951ee430, bifrost:sem:packet:packet:000b1b923bf4 | UNEXPECTED_POPULATED: was documented as NAMING_DRIFT_CHECK with 0 live rows; now has 46. Verify whether a writer was added and update this script's classification. |

## Drift flags requiring attention

- **gpu:autoencoder:latent_64:***: UNEXPECTED_EMPTY: documented as ACTIVE (live writer) but found 0 rows. Check whether the writer stopped running or Redis was flushed.
- **bifrost:***: UNEXPECTED_POPULATED: was documented as NAMING_DRIFT_CHECK with 0 live rows; now has 46. Verify whether a writer was added and update this script's classification.

## Next Safe Action

2 ownership-class drift flag(s) found -- see the "Drift flags requiring attention" section before trusting this audit's classification.
