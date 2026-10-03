# Installed-Library Documentation and Consolidation Priorities V1

- status: PRELIMINARY_MANIFEST_CENSUS
- authority: false
- date: 2026-09-30
- purpose: prioritize version-matched upstream documentation and production-hardening reviews across the repository's JavaScript/TypeScript, Python, Go, Rust, and C++ surfaces

## Important scope distinction

This is a repository-manifest/lockfile census, not proof that every listed package is installed in every local environment. Node versions below are resolved from the checked-in lockfiles; Python and Go versions are those declared by service-specific requirements or `go.mod`; Rust rows are workspace declarations unless a `Cargo.lock` is separately present and verified. A production inventory must keep `declared`, `lock-resolved`, `installed-in-environment`, `runtime-loaded`, and `production-called` as different states.

Do not crawl documentation for every transitive package. First inventory direct production dependencies and their actual callers; include transitive packages only when they define a public contract, a security boundary, a serialized format, or a cross-service protocol. Documentation is version-bound reference evidence, not a replacement for source code, local contracts, or runtime proof.

## Priority list

### P0 — canonical data, retrieval, and tool boundaries

| Library / docs set | Language | Observed lock or declaration | Why first | Official starting points |
| --- | --- | --- | --- | --- |
| PostgreSQL + pgvector | SQL / C | PostgreSQL 18 target; extension version must be read from the live server | Canonical identity, revisions, evidence, vector storage, indexes and migration behavior | [PostgreSQL manual](https://www.postgresql.org/docs/current/), [pgvector source/docs](https://github.com/pgvector/pgvector) |
| Drizzle ORM + Drizzle Kit | TypeScript | frontend lock: ORM 0.44.7, Kit 0.31.10 | App schema declarations and migration generation/application | [Drizzle overview](https://orm.drizzle.team/docs/overview), [migrations](https://orm.drizzle.team/docs/migrations) |
| Zod | TypeScript | 4.4.3 in root and frontend locks | Request/tool payload validation and typed boundary contracts | [Zod docs](https://zod.dev/) |
| Qdrant clients + server | TypeScript / Python / Go | server target 1.19.0; JS client 1.19.0; Python service lock includes qdrant-client 1.15.1; Go client 1.19.0 | Rebuildable vector projection, named-vector completeness, payload/filter/query compatibility | [Qdrant docs](https://qdrant.tech/documentation/), [points](https://qdrant.tech/documentation/manage-data/points/), [vectors](https://qdrant.tech/documentation/manage-data/vectors/), [hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/) |
| Redis / Valkey clients | TypeScript / Python / Go | Node locks contain ioredis 5.8.2; root also resolves redis 4.7.1; Python service lock redis 5.3.0; Go service go-redis/v9 9.16.0 | Disposable cache, TTL/invalidation, connection and serialization behavior | [Valkey docs](https://valkey.io/topics/), [Redis docs](https://redis.io/docs/latest/) |
| MCP / Zod tool schemas | TypeScript | existing repository MCP server and tool registries | Tool allow-list, input bounds, read/write separation and evidence-return shape | [MCP specification](https://modelcontextprotocol.io/specification/), local server contracts are authoritative |

### P1 — source understanding, orchestration, and service boundaries

| Library / docs set | Language | Observed lock or declaration | Why included | Official starting points |
| --- | --- | --- | --- | --- |
| SvelteKit + Svelte + TypeScript | TypeScript | frontend lock: Kit 2.59.1, Svelte 5.53.3, TypeScript 5.9.3 | Production app/runtime and server route conventions | [SvelteKit docs](https://svelte.dev/docs/kit), [Svelte docs](https://svelte.dev/docs/svelte), [TypeScript handbook](https://www.typescriptlang.org/docs/) |
| LangChain + LangGraph | TypeScript / Python | root JS lock: core 1.2.1, LangGraph 1.3.2; frontend JS: core 1.2.4, LangGraph 1.4.7; Python synthesis requirements: LangChain/LangGraph 1.2.11 | Optional orchestration/reference behavior; not canonical retrieval or write authority | [LangChain docs index](https://docs.langchain.com/llms.txt), [LangGraph docs](https://docs.langchain.com/oss/python/langgraph/overview) |
| Tree-sitter + language grammars + LSP | TypeScript / C | frontend lock: tree-sitter 0.25.1, TypeScript grammar 0.23.2, TS language server 5.3.0 | Deterministic syntax, spans, symbols and optional semantic enrichment | [Tree-sitter docs](https://tree-sitter.github.io/tree-sitter/), [TypeScript language server](https://github.com/typescript-language-server/typescript-language-server) |
| ast-grep | Rust / TypeScript | Runtime installation/caller still needs inventory proof | Syntax-aware structural search and rules; observations remain noncanonical until bound to source revisions | [ast-grep guide](https://ast-grep.github.io/guide/) |
| FastAPI + Pydantic | Python | service requirements vary: FastAPI 0.115.14–0.141.1; Pydantic 2.11.4–2.13.5 | Sidecar API schemas, health/readiness and response validation | [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/), [Pydantic docs](https://docs.pydantic.dev/latest/) |
| Go gRPC + protobuf + pgx | Go | search/retrieval services: gRPC 1.82.1, protobuf 1.36.11, pgx 5.7.6; embedding service is on gRPC 1.75.1 / protobuf 1.36.10; classifier uses pgx 5.5.2 | RPC/service contracts and Postgres access; version skew is a hardening review item, not automatic upgrade permission | [Go gRPC docs](https://grpc.io/docs/languages/go/), [Go protobuf docs](https://protobuf.dev/reference/go/go-generated/), [pgx API](https://pkg.go.dev/github.com/jackc/pgx/v5) |
| NetworkX + RAPIDS cuGraph/cuVS/cuML | Python / CUDA | NetworkX `>=3.4,<4`; RAPIDS versions are environment-specific and must be inventoried from the target WSL/container | CPU oracle and optional GPU graph/ANN/clustering execution | [NetworkX docs](https://networkx.org/documentation/stable/), [cuGraph](https://docs.rapids.ai/api/cugraph/stable/), [cuVS](https://docs.rapids.ai/api/cuvs/stable/) |

### P2 — specialized representations and ecosystem adapters

| Library / docs set | Language | Observed lock or declaration | Why included | Official starting points |
| --- | --- | --- | --- | --- |
| ONNX Runtime | TypeScript / C++ | frontend lock: node and web 1.29.0 | Model inference adapters and execution-provider behavior | [ONNX Runtime docs](https://onnxruntime.ai/docs/) |
| PyTorch + NumPy + PyArrow | Python / C++ | multiple service requirements with different Torch/NumPy pins; RAPIDS sidecar pins PyArrow 23.0.1 | Training/feature numerics and Arrow data transport; keep environment-specific | [PyTorch docs](https://pytorch.org/docs/stable/), [NumPy](https://numpy.org/doc/stable/), [PyArrow](https://arrow.apache.org/docs/python/) |
| OAKlib + NetworkX | Python | OAKlib 0.7.4; graph lane declares NetworkX `>=3.4,<4` | Ontology lookup and graph traversal adapters | [OAKlib docs](https://oaklib.readthedocs.io/en/latest/), [NetworkX docs](https://networkx.org/documentation/stable/) |
| Rust workspace: napi-rs, Tokio, Rayon, Serde | Rust / Node native | workspace declarations: napi/napi-derive 2.16, Tokio 1, Rayon 1.10, Serde 1 | Native boundary, async runtime, CPU parallelism and serialization | [napi-rs](https://napi.rs/), [Tokio](https://docs.rs/tokio/latest/tokio/), [Rayon](https://docs.rs/rayon/latest/rayon/), [Serde](https://serde.rs/) |
| simdjson / C++ bridge | C++ | exact CMake-resolved dependency and compiler/runtime versions require a separate native build inventory | JSON parsing/native ABI performance boundary | [simdjson docs](https://simdjson.org/) |
| BeautifulSoup + Firecrawl | Python / HTTP API | BeautifulSoup fallback exists in docs crawler; Firecrawl is optional API-key-backed acquisition | External-doc capture only; acquisition provenance must state which path actually fetched each page | [Beautiful Soup docs](https://www.crummy.com/software/BeautifulSoup/bs4/doc/), [Firecrawl docs](https://docs.firecrawl.dev/) |

## Consolidation signals found in the lock/dependency census

These are candidates for the later tournament/hardening pass, not changes authorized by this inventory:

1. Root and `sveltekit-frontend` lockfiles resolve different SvelteKit/Svelte versions (root 2.68.0/5.56.4; frontend 2.59.1/5.53.3), different Drizzle ORM versions (root lock has no entry; frontend 0.44.7), and different `pg` versions (root 8.22.0; frontend 8.16.3).
2. LangChain JS versions differ between root and frontend locks; LangGraph resolves 1.3.2 vs 1.4.7. Python synthesis is a separate pinned environment (LangGraph 1.2.11). Treat these as separate runtime lanes until caller and compatibility evidence says otherwise.
3. Redis client families coexist (Node `ioredis` and `redis`, Python `redis`, Go `go-redis`). The server/cache contract may be shared; the client libraries need not be consolidated unless call sites, retry/pooling semantics and operational owners are compatible.
4. Python sidecars pin different FastAPI/Pydantic/Torch/NumPy versions. Do not flatten them into one environment; compare image size, CUDA ABI, import/call graph and service ownership first.
5. Go retrieval services share recent pgx/Qdrant/Redis/gRPC dependencies, while the classifier and embedding service show older versions. Check generated protobuf compatibility and service boundaries before upgrades.
6. Rust workspace versions are declared centrally; inspect Cargo.lock and per-crate feature resolution before labeling them installed or proposing a workspace upgrade.

## Acquisition and supersession policy

- Acquire official, version-relevant docs into a new immutable run directory; never overwrite an existing corpus/index or replace source files in place.
- Prefer official versioned Markdown/API references. Firecrawl is an optional acquisition provider; BeautifulSoup/plain fetch are fallbacks. The receipt must record actual fetch method, canonical URL, resolved URL, content digest, fetched timestamp, package/runtime version, and failure reason.
- Split/chunk deterministically by document heading and bounded size, then build a local navigation/search index from the same checksummed run. External documentation remains `canonicalAuthority: false` until accepted by the existing external-document admission owner.
- A documentation index can support a read-only MCP reference tool only after its snapshot, bounds, citations, Zod contract, and caller registration are proven. It must not inject raw/unreviewed hits into synthesis or authorize code/dependency changes.
- Windows-native CUDA/TensorRT, WSL2 RAPIDS/cuTile, and Docker GPU packages are separate environment inventories; a README, image tag, or successful import in one environment does not prove installation or runtime availability in another.
- Library “enhanced” replacements are a later supersession pass: preserve the old file, create a separately named enhanced artifact with provenance and compatibility notes, validate consumers, update references through the approved owner, and archive/mark superseded only after the tournament gate and readback. Never delete the prior artifact as part of the docs pass.

## Tournament dependency gate

Do not start production-hardening version changes, consolidation, or enhanced-file supersession until the chosen tournament owner is complete and its evidence is read back. Current related OpenSpec trackers are still open: `parent-atlas-agentic-completion` task `AGENT-09` explicitly depends on the existing three-candidate seam, and `parent-atlas-graph-retrieval-proof` task `GS1.41` owns that bounded patch-tournament seam. The separate `parent-atlas-gpu-sidecar-patch-tournament` change is not automatically a substitute for either. Record the exact accepted tournament change/task IDs and completion receipts before unblocking this plan.
