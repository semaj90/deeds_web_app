# Design: Graph / PageRank / OKF Fan-out Hardening

## Scope and ownership

This change records targeted correctness fixes in existing graph and PageRank owners; it adds no new graph authority or retrieval lane.

- `atlas-rapids-pagerank-client.ts` keeps validation failures in the returned Promise contract so callers/tests can handle rejection consistently.
- `okf-schema.ts` mirrors the vocabulary used by the repository's `.okf/manifest.yaml`; the manifest remains the vocabulary input, and validation does not promote OKF data into canonical graph identity.
- `pagerank-parity.spec.ts` passes an explicit small fixture to both oracle processes. It must not inherit a machine-local default that may select the 486 MB frozen graph.
- `compute-pagerank-neo4j-v2.mjs` defaults to the small parity fixture. Explicit larger fixture ingestion is batched with `UNWIND`, constrained to allowlisted relationship types, and covered by fake-session tests before any live execution.

## Proof boundary

The recorded 4-spec suite proves the async rejection behavior, OKF vocabulary validation, small-fixture Neo4j GDS parity (recorded Spearman 1.0 and maximum score delta `2.75e-9`), and bounded fixture-ingestion behavior. It does not prove RAPIDS/cuGraph GPU parity or live large-input throughput.

The 2026-09-24 ingestion proof is code/test-only: no Neo4j script execution, live graph load, PageRank projection, or datastore write was performed. Any live projection/apply, large-corpus run, or GPU parity experiment is a separate gate and requires its own bounded inputs and authorization.

## Safety and rollback

The fixes are reversible source/test changes. The default fixture prevents an accidental large local snapshot from becoming an implicit test input. The explicit large-input path must retain batching, qualification, relationship allowlisting, and pre-write validation. This design makes no claim that a live graph revision was emitted or frozen.
