# Phase 107 Materializer Smoke

Generated at: 2026-07-21T18:50:04.104Z
Mode: DRY-RUN
Limit: 1

## Summary

- packets selected: 1
- records emitted: 1
- normalized records: 1
- fallback records: 1
- unresolved records: 0
- ambiguous records: 0
- duplicate records: 0
- missing content hash records: 0
- schema validation failures: 0

## Counts by source table

- feature_domain_facts: 1

## Counts by join method

- packet_key: 1

## Counts by fallback reason

- ontology_fallback: 1

## Hash status

- CANONICAL_SOURCE_HASH: 0
- DERIVED_MIGRATION_HASH: 1
- MISSING: 0
- INVALID_PLACEHOLDER: 0

## DuckDB profile

- available: yes
- matches summary: yes
- rowCount: 1
- normalizedRecords: 1
- fallbackRecords: 1
- unresolvedRecords: 0
- duplicateRecords: 0
- missingContentHashRecords: 0

## Sample rows

- 0ba2345cd9c542fa | proto:RetrievalService.Health | feature_domain_facts | packet_key | DERIVED_MIGRATION_HASH
