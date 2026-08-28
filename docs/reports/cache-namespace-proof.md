# Cache Namespace Proof

Generated: 2026-08-27T22:13:10.687Z
Status: FAIL

| Namespace | Pattern | Role | Keys | Status |
|---|---|---|---:|---|
| hyperrag_exact | `hyperrag:query:*` | query exact-match cache | 0 | FAIL_EMPTY |
| bifrost | `bifrost:*` | semantic packet/cache mirror | 0 | FAIL_EMPTY |
| som | `som:*` | SOM routing and centroid metadata | 0 | FAIL_EMPTY |
| ace | `ace:*` | ACE planner/context packets | 2 | PASS |
| karpathy | `gpu:karpathy:*` | GPU rerank scores | 2 | PASS |
| centroid | `centroid:*` | community centroid shortcuts | 0 | PASS |

- sampled namespace collisions: 0
- Postgres remains canonical; all listed namespaces are runtime mirrors or accelerators.
