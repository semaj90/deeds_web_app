Usage examples for `src/lib/ai/hypergraph.ts`

1) Lookup by centroid id (client-side)

```ts
import { lookupByCentroid } from '$lib/ai/hypergraph';

async function example() {
  const resp = await lookupByCentroid(0, 8);
  console.log('neighbors for centroid 0', resp.neighbors);
}
```

2) Lookup by vector (client-side)

```ts
import { lookupByVector } from '$lib/ai/hypergraph';

async function exampleVec() {
  const vec = [0.12, 0.34, 0.56];
  const resp = await lookupByVector(vec, 8);
  console.log('nearest centroids', resp.results);
}
```

Notes:
- These helpers call the SvelteKit endpoint at `/api/hypergraph/lookup`.
- Ensure your dev server has access to Redis and the `prefix:centroids` / `prefix:neighbors` keys.
