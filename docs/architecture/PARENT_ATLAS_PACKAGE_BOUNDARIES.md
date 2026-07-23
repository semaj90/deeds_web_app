# Parent Atlas Package Boundaries

## Ownership

| Surface | Owns | Must not own |
|---|---|---|
| `packages/atlas` | Portable contracts and pure identity helpers | Infrastructure clients, migrations, CLI behavior |
| `packages/parent-atlas` | Typed domain services, PostgreSQL/Neo4j/Qdrant/Valkey adapters, V2 graph persistence | Duplicate portable identity helpers |
| `scripts/atlas` | Operational CLI entrypoints, smoke tests, one-time migration runners | Independent copies of package logic |
| `sveltekit-frontend` | HTTP/UI integration, Drizzle migrations, server composition | Canonical graph authority computation |

## Rules

1. One implementation has one declared owner.
2. Scripts import package exports; they do not manually mirror implementation.
3. `packages/atlas` exports only portable code.
4. V2 contextual-tree compilation and graph persistence are owned by
   `packages/parent-atlas` until a future portable extraction is explicitly
   approved.
5. `scripts/atlas/atlas-package-boundaries.json` is the machine-readable
   boundary manifest. Its verifier must pass before a release gate can report
   package-boundary readiness.
