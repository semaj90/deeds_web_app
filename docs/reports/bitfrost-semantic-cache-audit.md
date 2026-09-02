# BitFrost / ACE / Karpathy Redis Cache Audit

Generated: 2026-09-02T00:28:07.848Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary by ownership class

| Ownership | Families | Total keys |
|---|---:|---:|
| ACTIVE | 8 | 15129 |
| ASPIRATIONAL | 13 | 0 |
| LEGACY | 2 | 0 |
| WARMED_PENDING | 4 | 0 |
| NAMING_DRIFT_CHECK | 1 | 0 |

## Families

| Key pattern | Ownership | Count | Sample | Drift flag |
|---|---|---:|---|---|
| `bitfrost:summary:packet:v1:*` | ACTIVE | 4826 | bitfrost:summary:packet:v1:packet:29d902b14689, bitfrost:summary:packet:v1:packet:f163c0a34186, bitfrost:summary:packet:v1:packet:836ba385968f, bitfrost:summary:packet:v1:packet:8ff2841f7419, bitfrost:summary:packet:v1:packet:834f04fa096e |  |
| `gpu:som:packet:*` | ACTIVE | 5000 | gpu:som:packet:3535, gpu:som:packet:3448, gpu:som:packet:1732, gpu:som:packet:4397, gpu:som:packet:1972 |  |
| `gpu:som:cell:*` | ACTIVE | 296 | gpu:som:cell:7:0, gpu:som:cell:19:12, gpu:som:cell:15:12, gpu:som:cell:12:19, gpu:som:cell:3:18 |  |
| `gpu:autoencoder:latent_64:*` | ACTIVE | 5000 | gpu:autoencoder:latent_64:91, gpu:autoencoder:latent_64:3516, gpu:autoencoder:latent_64:297, gpu:autoencoder:latent_64:2285, gpu:autoencoder:latent_64:1950 |  |
| `gpu:karpathy:scores` | ACTIVE | 1 | gpu:karpathy:scores |  |
| `gpu:karpathy:summary` | ACTIVE | 1 | gpu:karpathy:summary |  |
| `gpu:karpathy:encoded` | ASPIRATIONAL | 0 | none |  |
| `embed:v2:embeddinggemma:latest:*` | ACTIVE | 3 | embed:v2:embeddinggemma:latest:8e6565b4d5aed79ca0dff3fad3b2ce706e3b152494a629e4e1a9fe4dcb7e3525, embed:v2:embeddinggemma:latest:6bd35c5d44ccb95707b7d54f7f530a05579dcda94994c1f55fc1e0fbe2e03eed, embed:v2:embeddinggemma:latest:ddc1ba0424a7319cd51df5572f2abb6b502cf4141789cf165c7552a4d406585a |  |
| `embed:embeddinggemma:latest:*` | LEGACY | 0 | none |  |
| `ace:*` | ACTIVE | 2 | ace:cluster:members:unclassified:community-26562, ace:path:cluster:1 |  |
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

(none -- every family matches its documented ownership class)

## Next Safe Action

Review any entries under "Drift flags requiring attention" before trusting ACTIVE-class families for retrieval decisions.
