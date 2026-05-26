# Find Feature Files

Use this before editing a feature.

Run:

```bash
node scripts/opencode/find-feature-files.mjs --feature "$ARGUMENTS" --json
```

Rules:

Use returned ownerFiles first.
Use sourceRefs before reading large docs.
Do not read whole markdown files unless the JSON says to.
Do not guess paths.
If no ownerFiles are returned, run rg --files before reading.
After edits, post an observation with scripts/opencode/post-memory.mjs.

## Add package script

In root `package.json`:

```json
{
  "scripts": {
    "opencode:find-feature": "node scripts/opencode/find-feature-files.mjs"
  }
}
```

Use:

```bash
npm run opencode:find-feature -- --feature "env module" --json
```

Better version later

Once the simple one works, add these modules:

Postgres search:
- agent_memory_observations
- intent_synthesis
- atlas_feature_cards
- atlas_chunks

Qdrant semantic search:
- agent_memory_observations
- codebase_chunks_768
- atlas_feature_cards

Redis hot memory:
- ace:memory:claude-mem:latest
- ace:ctx:*
- cluster:kmeans:k20:manifold4:all
- gpu:karpathy:encoded

TurboVec:
- rerank top 50 candidates
- return top 10 ownerFiles
Feature finder output OpenCode should trust
{
  "featureId": "env-module",
  "ownerFiles": [
    "sveltekit-frontend/src/lib/server/env.server.ts",
    "sveltekit-frontend/docs/startup.md",
    "docker/bifrost/config.json"
  ],
  "sourceRefs": [
    "sveltekit-frontend/src/lib/server/env.server.ts:10",
    "sveltekit-frontend/docs/startup.md:42"
  ],
  "constraints": [
    "do not run drizzle-kit push",
    "do not read full docs",
    "patch confirmed files only"
  ],
  "nextSteps": [
    "read small windows in ownerFiles",
    "patch env mapping",
    "run smoke"
  ]
}
