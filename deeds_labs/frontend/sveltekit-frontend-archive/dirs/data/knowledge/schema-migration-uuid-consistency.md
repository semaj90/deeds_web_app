# Database Schema Migration: Integer to UUID User IDs

## Issue
The database schema had inconsistent foreign key types for user references:
- `users.id` is `uuid`
- Some tables used `integer` for `createdBy`/`userId` fields
- This caused TypeScript type errors when comparing `locals.user.id` (UUID string) with integer fields

## Tables Fixed
1. **reports**: `createdBy` changed from `integer` to `uuid`
2. **personsOfInterest**: `createdBy` changed from `integer` to `uuid`
3. **savedReports**: `userId` changed from `integer` to `uuid`
4. **themes**: `userId` changed from `integer` to `uuid`
5. **legalDocuments**: `userId` and `createdBy` changed from `integer` to `uuid`

## Migration Path
```sql
-- Example migration for reports table
ALTER TABLE reports
  ALTER COLUMN created_by TYPE uuid USING created_by::text::uuid;

-- Example migration for persons table
ALTER TABLE persons
  ALTER COLUMN created_by TYPE uuid USING created_by::text::uuid;
```

## Related Files
- `src/lib/server/db/schema-postgres.ts` - Schema definitions
- `src/routes/api/cases/+server.ts` - Uses UUID comparisons
- `src/routes/api/reports/+server.ts` - Uses UUID comparisons
- `src/routes/api/persons/+server.ts` - Uses UUID comparisons

## Tags
#database #migration #uuid #schema #postgresql #drizzle-orm #type-safety

## Vector Embeddings Context
- Database schema consistency
- Foreign key type matching
- PostgreSQL UUID type conversions
- Drizzle ORM type inference
- SvelteKit API endpoint type safety
