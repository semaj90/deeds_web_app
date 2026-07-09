# Session 124 HMM Tool Router

Implement the deterministic HMM tool router without changing production retrieval defaults.

Rules:

- HMM routes tool states only.
- XGBoost recommends lanes only.
- RRF remains final ranking authority.
- Gemma4 cannot synthesize unless packet validation score is at least 0.8.
- Code-location intent must rank `rg.search` or `ast_grep.search` first.
- Add JSON schema / OKF contract.
- Add smoke tests.
- Do not call Qdrant, Redis, Neo4j, Postgres, or Gemma4 directly from the router.
- Do not mutate packet identity.

Flow:

```text
user query
-> tool index search
-> HMM state gate
-> rules allow/block
-> ranked tools
-> execute best safe tool
```

Smoke command:

```bash
npm run atlas:hmm:tool-router:smoke
```

