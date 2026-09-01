## Ownership

Parent Atlas TypeScript owns ConstraintV2, OWL/SHACL projection, and receipts.
The existing Python 8095 sidecar owns the future `FormalProfileClientV1`
FastAPI adapter. OAK/oaklib remains Python ontology access only. That adapter
may invoke an explicitly provisioned OWLAPI Java subprocess for parsing and
profile checking; it does not embed a JVM in Neo4j. ELK and HermiT are later
candidates after a real profile result.

## Flow

```text
ConstraintV2
  ├─> OWL V2 projection ──> completeness receipt ──> OWLAPI profile check
  └─> SHACL projection ──> data-shape receipt
```

The future live transport is:

```text
TypeScript receipt/client → Python FastAPI 8095 → OWLAPI parser/profile checker
```

The profile adapter accepts an injected OWLAPI result for tests and returns
`UNAVAILABLE`, `UNKNOWN`, and `NONE` when no isolated runtime is configured.
No heuristic may select a reasoner. SHACL validation is parallel and does not
determine the OWL profile.

## Safety

All receipts are non-canonical and read-only. No ontology download, JVM
installation, database write, graph mutation, or reasoner invocation occurs in
this change. The current Python adapter remains unavailable until the OWLAPI
runtime is explicitly provisioned.
