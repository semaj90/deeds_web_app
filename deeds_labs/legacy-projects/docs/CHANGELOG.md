# Changelog

## [Unreleased]

## [2025-12-03] - YoRHa v2 Database Migration
### Added
- **YoRHa Schema Tables**:
  - `yorha_cases`: Case management
  - `yorha_evidence_nodes`: Evidence board nodes
  - `yorha_evidence_connections`: Semantic relationships
  - `yorha_chat_sessions`: Chat integration
  - `yorha_chat_messages`: Message history
  - `yorha_system_metrics`: Performance monitoring
- **Drizzle ORM**: Updated schema definitions in `src/lib/db/schema/yorha.ts`
- **Tests**: Added `test/yorha-test.ts` for schema verification

### Changed
- **Routes**: Archived legacy `[caseId]` routes to `src/routes/archive/legacy-cases-caseId`
- **Consolidation**: Standardized on `[id]` parameter for case routes

### Security
- Database migration performed safely with no data loss
- Backup created before migration
