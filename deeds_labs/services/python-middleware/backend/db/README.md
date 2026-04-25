# Database Layer - NES Command Center

This directory contains the database layer for the NES Command Center using Drizzle ORM 0.44 with PostgreSQL.

## Files

### `schema.ts`
Drizzle ORM table definitions for all database entities:
- `routeMetadata` - Route definitions and status
- `errorCluster` - Grouped errors from build tools
- `routeHealthEvent` - Health status change history
- `errorBrainAnalysis` - AI analysis results
- `errorBrainPatch` - Applied patches and verification
- `routeInteractionLog` - User interaction tracking
- `errorClusterArchive` - Archived error clusters (90+ days)
- `routeInteractionLogArchive` - Archived interaction logs (180+ days)

All tables include:
- Proper indexes on route_id, timestamp, status, tool columns
- Foreign key relationships for referential integrity
- Soft delete pattern with archived_at timestamp (no data loss)
- UTC timezone for all timestamps

### `pool.ts`
PostgreSQL connection pool management:
- `initializePool()` - Initialize connection pool at startup
- `getDb()` - Get Drizzle ORM instance
- `getPool()` - Get raw PostgreSQL pool
- `closePool()` - Close pool on shutdown
- `testConnection()` - Health check
- `getPoolStats()` - Monitor pool usage

### `queries.ts`
Type-safe query helpers using Drizzle ORM:

**Route Metadata:**
- `getRouteMetadata()` - Get single route
- `getAllRouteMetadata()` - Get all routes (with archive filter)
- `createRouteMetadata()` - Create new route
- `updateRouteMetadata()` - Update route
- `archiveRouteMetadata()` - Soft delete route

**Error Clusters:**
- `getErrorClusters()` - Get errors for route (with pagination)
- `getErrorClusterCount()` - Count errors
- `createErrorCluster()` - Create error
- `resolveErrorCluster()` - Mark error as resolved

**Health Events:**
- `getHealthEvents()` - Get health history
- `getLatestHealthEvent()` - Get most recent status
- `createHealthEvent()` - Create status change event

**Error Brain:**
- `getErrorBrainAnalyses()` - Get analyses for route
- `createErrorBrainAnalysis()` - Create analysis
- `updateErrorBrainAnalysis()` - Update analysis
- `getErrorBrainPatches()` - Get patches for analysis
- `createErrorBrainPatch()` - Create patch
- `updateErrorBrainPatchVerification()` - Verify patch
- `getPatchSuccessRate()` - Calculate success rate

**Interactions:**
- `getInteractionLogs()` - Get interaction history
- `createInteractionLog()` - Log interaction

**Utilities:**
- `calculateRouteHealth()` - Determine health status
- `getRouteStats()` - Get comprehensive route statistics

### `migrations.ts`
Migration management:
- `runMigrations()` - Run all pending migrations
- `getMigrationStatus()` - Get applied migrations
- `isMigrationsTableExists()` - Check migrations table
- `initializeMigrationsTable()` - Create migrations table
- `rollbackLastMigration()` - Rollback last migration (use with caution)
- `getPendingMigrations()` - Get unapplied migrations

### `queries.test.ts`
Comprehensive unit tests using Vitest:
- Route metadata CRUD operations
- Error cluster creation and querying
- Health event tracking
- Interaction logging
- Route health calculation
- Route statistics

## Setup

### 1. Install Dependencies

```bash
npm install drizzle-orm pg drizzle-kit
npm install -D vitest @types/pg
```

### 2. Environment Variables

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=legal_ai
DB_USER=postgres
DB_PASSWORD=postgres

# For testing
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=legal_ai_test
TEST_DB_USER=postgres
TEST_DB_PASSWORD=postgres
```

### 3. Initialize Database

```bash
# Create database
createdb legal_ai

# Run migrations
npm run db:migrate
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run database tests only
npm test -- db/queries.test.ts

# Run with coverage
npm test -- --coverage
```

## Usage

### In API Handlers

```typescript
import { getDb } from '$lib/db/pool';
import { getRouteMetadata, createErrorCluster } from '$lib/db/queries';

// Get route metadata
const route = await getRouteMetadata('/cases/[id]/overview');

// Create error cluster
const error = await createErrorCluster({
  routeId: '/cases/[id]/overview',
  tool: 'tsc',
  code: 'TS2345',
  message: 'Type error',
  severity: 'error',
});

// Calculate health
const health = await calculateRouteHealth('/cases/[id]/overview');
```

### In Server Load Functions

```typescript
import { getAllRouteMetadata, getRouteStats } from '$lib/db/queries';

export const load: PageServerLoad = async () => {
  const routes = await getAllRouteMetadata();

  const enrichedRoutes = await Promise.all(
    routes.map(async (route) => ({
      ...route,
      stats: await getRouteStats(route.routeId),
    }))
  );

  return { routes: enrichedRoutes };
};
```

## Soft Delete Pattern

All tables use soft delete with `archived_at` timestamp:

```typescript
// Archive a route (doesn't delete, just marks as archived)
await archiveRouteMetadata('/test-route');

// Query non-archived routes (default)
const routes = await getAllRouteMetadata(false);

// Query all routes including archived
const allRoutes = await getAllRouteMetadata(true);
```

## Data Retention

- **Error Clusters**: Archived after 90 days
- **Interaction Logs**: Archived after 180 days
- **Archived Data**: Moved to `*_archive` tables
- **Queries**: Default to non-archived data

## Performance

All tables have indexes on:
- `route_id` - Foreign key lookups
- `timestamp` - Time-based queries
- `status` - Health filtering
- `tool` - Error tool filtering

Query performance targets:
- Single route lookup: < 10ms
- List routes with pagination: < 50ms
- Calculate health: < 20ms
- Get route stats: < 100ms

## Monitoring

```typescript
import { getPoolStats, testConnection } from '$lib/db/pool';

// Check connection health
const isHealthy = await testConnection();

// Monitor pool usage
const stats = getPoolStats();
console.log(`Pool: ${stats.idleCount}/${stats.totalCount} idle`);
```

## Troubleshooting

### Connection Refused
- Check PostgreSQL is running
- Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
- Check firewall rules

### Migration Errors
- Ensure migrations table exists: `initializeMigrationsTable()`
- Check migration files in `drizzle/` directory
- Review migration logs for specific errors

### Query Timeouts
- Check indexes are created
- Monitor pool stats for connection issues
- Review slow query logs

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
