# Cache Namespace Proof

Generated: 2026-06-21T05:40:21.450Z
Status: PASS

| Namespace | Pattern | Role | Keys | Status |
|---|---|---|---:|---|
| hyperrag_exact | `hyperrag:query:*` | query exact-match cache | 80 | PASS |
| bifrost | `bifrost:*` | semantic packet/cache mirror | 346 | PASS |
| som | `som:*` | SOM routing and centroid metadata | 152 | PASS |
| ace | `ace:*` | ACE planner/context packets | 1310 | PASS |
| karpathy | `gpu:karpathy:*` | GPU rerank scores | 1 | PASS |
| centroid | `centroid:*` | community centroid shortcuts | 85 | PASS |

- sampled namespace collisions: 0
- Postgres remains canonical; all listed namespaces are runtime mirrors or accelerators.
