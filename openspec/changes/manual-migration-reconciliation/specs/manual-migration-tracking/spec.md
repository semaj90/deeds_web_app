# Manual Migration Tracking Spec

## ADDED Requirements

### Requirement: every manual sidecar migration has a known applied state
The system SHALL track, for every file in `drizzle/manual/*.sql`, whether its target table(s) exist in the live `legal_ai_db` database.

#### Scenario: sweep detects an unapplied sidecar migration
- **WHEN** a `drizzle/manual/*.sql` file declares `CREATE TABLE IF NOT EXISTS <table>`
- **AND** `<table>` is not present in `information_schema.tables` for the live database
- **THEN** the sweep SHALL report that file as MISSING
- **AND** the file SHALL NOT be assumed applied just because it exists on disk

### Requirement: no blind apply of manual migrations that touch existing tables
The system SHALL NOT apply a `drizzle/manual/*.sql` file directly to `legal_ai_db` if that file contains `DROP`, `ALTER TABLE ... DROP`, `RENAME`, or `TRUNCATE` statements against a table that is already live, without a statement-by-statement review first.

#### Scenario: schema-merge file targets a live table
- **WHEN** a manual migration file contains a `DROP TRIGGER` (or other destructive statement) against a table name that is confirmed live
- **THEN** the file SHALL be classified as Tier C (needs statement-by-statement review)
- **AND** it SHALL NOT be applied until reviewed against a non-production database first

### Requirement: dedup check before applying additive tables with ambiguous names
The system SHALL check whether a new table name proposed by a manual migration is a likely duplicate of an existing canonical table (per CLAUDE.md's Consolidation Sweep Rule) before applying it.

#### Scenario: candidate table name resembles an existing canonical table
- **WHEN** a manual migration proposes a new table (e.g. `evidence_items`) that is semantically close to an existing live table (e.g. `evidence`)
- **THEN** the file SHALL be classified as Tier B (needs dedup review)
- **AND** the migration SHALL only be applied once the new table is confirmed to be a genuinely new concept, not naming drift for the same concept
