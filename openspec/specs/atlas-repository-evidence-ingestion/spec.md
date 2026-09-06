# Parent Atlas Repository Evidence Ingestion — Requirements

## Purpose

Define multi-source repository evidence ingestion, normalization, revisioning, and invalidation.

## Requirements

### Requirement: Multi-source repository ingestion

The system SHALL ingest repository evidence from heterogeneous sources without treating any single source as sufficient proof of feature completion.

Supported evidence sources SHOULD include:

- OpenSpec specifications and change artifacts
- Spec Kit `.specify` artifacts when present
- planning/checklist markdown
- markdown tables
- TODO/FIXME/task documents
- `package.json` and lockfiles
- source files and AST facts
- routes and middleware/hooks
- database schema/migrations
- tests and test reports
- generated receipts
- runtime observations
- indexed documentation metadata

---

### Requirement: Markdown structure extraction

Markdown ingestion SHALL preserve headings, checkboxes, tables, code references and requirement identifiers as structured evidence.

A checked checkbox SHALL be treated as a claim of completion unless corroborated by configured implementation/validation evidence.

---

## Requirement: Table/schema feature evidence

Database tables, columns, foreign keys, indexes, policies and migration history MAY produce feature evidence candidates.

Schema existence SHALL NOT by itself prove that a user-facing feature is wired or authorized.

### Scenario: User-owned record table

Given a table contains `user_id` and a foreign key to a user/account table,
when Atlas infers feature evidence,
then it MAY emit ownership/authentication evidence candidates but SHALL require route/service/policy evidence before asserting an auth-guarded feature.

---

## Requirement: Package capability inference

Package manifests SHALL produce `PackageCapabilityCandidateV1` records based on package name, version, scripts and repository imports.

Installed package presence SHALL be distinguished from actual runtime wiring.

---

## Requirement: Version-aware documentation

When Atlas uses external library documentation as evidence, it SHOULD bind documentation chunks to package/library version constraints where available.

Newer documentation incompatible with the repository version SHALL be down-ranked or marked version-mismatched.

---

## Requirement: Domain classification

Deterministic rules SHOULD classify obvious evidence domains first.

A local model/QLoRA adapter MAY classify ambiguous evidence, but model output SHALL be recorded as inferred evidence with confidence and SHALL NOT overwrite canonical identity without promotion.

---

## Requirement: Evidence candidate normalization

All extractors SHALL normalize output into a common candidate contract containing at least:

- `candidate_id`
- `source_kind`
- `source_ref`
- `source_revision`
- `domain`
- `entity_kind`
- `relation_hint?`
- `feature_key_hint?`
- `text?`
- `structured_payload?`
- `confidence`
- `producer_revision`

---

## Requirement: Incremental invalidation

Ingestion SHOULD recompute only evidence transitively affected by changed repository/database/runtime revisions.

Previously materialized evidence SHALL remain historical and replayable.
