# Cache Namespace Proof

Generated: 2026-06-19T23:08:48.977Z
Status: PASS

| Namespace | Pattern | Role | Keys | Status |
|---|---|---|---:|---|
| hyperrag_exact | `hyperrag:query:*` | query exact-match cache | 32 | PASS |
| bifrost | `bifrost:*` | semantic packet/cache mirror | 148 | PASS |
| som | `som:*` | SOM routing and centroid metadata | 152 | PASS |
| ace | `ace:*` | ACE planner/context packets | 1263 | PASS |
| karpathy | `gpu:karpathy:*` | GPU rerank scores | 1 | PASS |
| centroid | `centroid:*` | community centroid shortcuts | 85 | PASS |

- sampled namespace collisions: 0
- Postgres remains canonical; all listed namespaces are runtime mirrors or accelerators.
