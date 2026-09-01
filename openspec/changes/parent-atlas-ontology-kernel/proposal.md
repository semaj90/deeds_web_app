## Why

Parent Atlas needs a bounded ontology-kernel contract that separates ontology
access, OWL/SHACL compilation, profile checking, and future formal reasoning.
The existing implementation now has these pieces, but its historical task
ledger lacks the planning artifacts required to validate the change.

## What Changes

- Record structured ConstraintV2 semantics and deterministic OWL/SHACL receipts.
- Define a Python/FastAPI profile-check adapter boundary without installing a reasoner.
- Keep `UNKNOWN` profile results fail-closed with no reasoner route.
- Preserve Postgres, Neo4j, oaklib, NetworkX, cuGraph, FastAPI, and MCP ownership boundaries.

## Capabilities

### New Capabilities

- `ontology-kernel-profile-gate`: structured projection completeness and profile-check admission.

### Modified Capabilities

- None.

## Impact

Affected files are under `packages/parent-atlas/src/core`, the existing Python
8095 NLP/OAK sidecar, related reports, and this OpenSpec change. The Python
adapter may later invoke an explicitly provisioned OWLAPI Java subprocess;
`oaklib` remains the Python ontology-access dependency. No database schema,
service dependency, or production mutation path changes now.
