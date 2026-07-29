# Traversal Budget v1

Canonical source:
- `sveltekit-frontend/src/lib/server/atlas/contracts/semantic-signal-v1.ts`

Hard limits:
- `max_seeds`
- `max_hops`
- `max_nodes`
- `max_edges`
- `max_returned_facts`
- `max_queries_per_round`
- `max_retrieval_rounds`

Rule:
- Budgets gate traversal; they do not authorize unbounded graph expansion.
