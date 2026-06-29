# VALIDATION_RULES.md

## Search First
1. rg
2. ast-grep
3. schema introspection
4. packet lookup
5. tool registry lookup

## Benchmark Rules
benchmark=True:
- fixed shape eval only

deterministic=True:
- replay proof only

Never mix benchmark and deterministic replay lanes.

## Quality Gates
Must pass:
- replay proof
- smoke tests
- telemetry written
- schema validation
- graph edge validation
- ontology validation
- retrieval benchmark
- reranker benchmark

## End-to-End Semantics
Truth:
- Embedding768

Retrieval:
- Embedding384

Routing:
- latent64

Topology:
- SOM
- clusters

Ontology:
packet -> feature -> domain -> community -> concept -> file

Runtime:
- telemetry
- traces
- errors

No layer may redefine another layer.
