# BitFrost / ACE / Karpathy Redis Cache Audit

Generated: 2026-08-30T07:56:58.307Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary by ownership class

| Ownership | Families | Total keys |
|---|---:|---:|
| ACTIVE | 8 | 15131 |
| ASPIRATIONAL | 13 | 0 |
| LEGACY | 2 | 11 |
| WARMED_PENDING | 4 | 0 |
| NAMING_DRIFT_CHECK | 1 | 0 |

## Families

| Key pattern | Ownership | Count | Sample | Drift flag |
|---|---|---:|---|---|
| `bitfrost:summary:packet:v1:*` | ACTIVE | 4826 | bitfrost:summary:packet:v1:packet:052e26c72e4d, bitfrost:summary:packet:v1:packet:8a68ca1ca8a7, bitfrost:summary:packet:v1:packet:32bce8852cc0, bitfrost:summary:packet:v1:packet:0c0fd3a65758, bitfrost:summary:packet:v1:packet:03d9c8b9c4a4 |  |
| `gpu:som:packet:*` | ACTIVE | 5000 | gpu:som:packet:4475, gpu:som:packet:3706, gpu:som:packet:111, gpu:som:packet:1140, gpu:som:packet:2920 |  |
| `gpu:som:cell:*` | ACTIVE | 296 | gpu:som:cell:3:1, gpu:som:cell:12:17, gpu:som:cell:11:1, gpu:som:cell:5:6, gpu:som:cell:13:5 |  |
| `gpu:autoencoder:latent_64:*` | ACTIVE | 5000 | gpu:autoencoder:latent_64:2050, gpu:autoencoder:latent_64:3343, gpu:autoencoder:latent_64:816, gpu:autoencoder:latent_64:3243, gpu:autoencoder:latent_64:2034 |  |
| `gpu:karpathy:scores` | ACTIVE | 1 | gpu:karpathy:scores |  |
| `gpu:karpathy:summary` | ACTIVE | 1 | gpu:karpathy:summary |  |
| `gpu:karpathy:encoded` | ASPIRATIONAL | 0 | none |  |
| `embed:v2:embeddinggemma:latest:*` | ACTIVE | 3 | embed:v2:embeddinggemma:latest:ddc1ba0424a7319cd51df5572f2abb6b502cf4141789cf165c7552a4d406585a, embed:v2:embeddinggemma:latest:6bd35c5d44ccb95707b7d54f7f530a05579dcda94994c1f55fc1e0fbe2e03eed, embed:v2:embeddinggemma:latest:8e6565b4d5aed79ca0dff3fad3b2ce706e3b152494a629e4e1a9fe4dcb7e3525 |  |
| `embed:embeddinggemma:latest:*` | LEGACY | 11 | embed:embeddinggemma:latest:ffc6b1ffa6e9fdcc, embed:embeddinggemma:latest:05119d06ad98a2a0, embed:embeddinggemma:latest:4f6592940c90014f, embed:embeddinggemma:latest:5011075a83c3c4e6, embed:embeddinggemma:latest:45a57a03995f2fe0 |  |
| `ace:*` | ACTIVE | 4 | ace:cluster:members:unclassified:community-67456, ace:probe:embed:karpathy, ace:path:cluster:1, ace:cluster:members:unclassified:community-26562 |  |
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
