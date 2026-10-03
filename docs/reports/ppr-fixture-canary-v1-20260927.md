# Personalized PageRank parity fixture

Status: `PARITY_PROVEN` for a synthetic five-ordinal directed graph only.

The input binds graph revision, candidate snapshot, both ordinal-map checksums,
directed edge set, normalized seed weights, alpha, epsilon, iteration limit,
and dangling redistribution policy. NetworkX and RAPIDS cuGraph 26.06.00 both
returned all five CandidateOrdinals, including one isolated vertex. Dangling
vertices were `{3,4}` and both implementations redistributed their dangling
mass according to the personalization vector.

Measured CPU/GPU agreement:

- Pearson: `0.9999999999999996`; Spearman: `1.0`.
- Score L1: `2.9802322387695312e-8`; L-infinity: `9.275637258276959e-9`.
- Top-10/50/100 overlap: `5/5` for each (the graph has five nodes).
- Absolute rank displacement: mean/median/max `0/0/0`.
- Score sums: `1.0` and `1.0000000298023224`.
- Dangling score-mass delta: approximately `9.0e-9`.

Full machine-readable identity and output checksums are in
`ppr-fixture-canary-v1-20260927.json`.

This is not proof over a live admitted graph, not proof of 8098 resident-graph
cache reuse, and not retrieval-quality evidence. No PostgreSQL, Qdrant,
Valkey/Redis, RabbitMQ, Neo4j, or Graphify writes/runs occurred. No SIMT kernel
was built. cuVS/CAGRA remains a vector-neighbor executor, not a PageRank
backend; DuckDB is only an offline receipt-analysis option.

## Engineering interpretation

Personalized PageRank is an appropriate query-conditioned graph-expansion
operator when the graph and seed CandidateOrdinals are already admitted and
revision-bound. The next live gate needs a frozen graph artifact, seed vector,
graph/candidate coordinate checksums, CPU oracle result, and a GPU executor
receipt. GPU cache HIT behavior is a separate gate requiring an existing cache
owner and readback proof.

“Hilbert space” is not a separate competing vector space here: finite real
semantic vectors use the ordinary Euclidean inner product. Hamming distance is
for binary codes/projections and must remain a separately identified artifact.
A Jacobian is a local derivative/linear map for a specified function and point,
not a generic second ranking space. None of these claims defines a new
CandidateOrdinal or graph identity.
