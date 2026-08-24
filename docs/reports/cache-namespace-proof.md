# Cache Namespace Proof

Generated: 2026-08-24T21:50:59.070Z
Status: FAIL

| Namespace | Pattern | Role | Keys | Status |
|---|---|---|---:|---|
| hyperrag_exact | `hyperrag:query:*` | query exact-match cache | 0 | FAIL_EMPTY |
| bifrost | `bifrost:*` | semantic packet/cache mirror | 46 | PASS |
| som | `som:*` | SOM routing and centroid metadata | 0 | FAIL_EMPTY |
| ace | `ace:*` | ACE planner/context packets | 51 | PASS |
| karpathy | `gpu:karpathy:*` | GPU rerank scores | 1 | PASS |
| centroid | `centroid:*` | community centroid shortcuts | 66 | PASS |

- sampled namespace collisions: 0
- Postgres remains canonical; all listed namespaces are runtime mirrors or accelerators.
