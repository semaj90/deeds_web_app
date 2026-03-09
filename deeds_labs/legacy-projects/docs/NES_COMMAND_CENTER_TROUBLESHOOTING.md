# NES Command Center Troubleshooting Guide

## Common Issues and Solutions

---

## Database Issues

### Connection Refused

**Symptom:** `ECONNREFUSED` or `Connection refused` errors

**Solutions:**
1. Verify PostgreSQL is running:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. Check DATABASE_URL format:
   ```bash
   # Correct format
   DATABASE_URL=postgresql://user:password@localhost:5432/legal_ai_db
   ```

3. Verify database exists:
   ```bash
   psql -l | grep legal_ai_db
   ```

4. Check firewall/network settings

---

### Migration Failures

**Symptom:** `relation does not exist` or migration errors

**Solutions:**

1. Check migration status:
   ```sql
   SELECT * FROM drizzle_migrations ORDER BY created_at DESC LIMIT 5;
   ```

2. Re-run migrations:
   ```bash
   npm run db:migrate
   ```

3. Manual migration (if needed):
   ```bash
   psql $DATABASE_URL -f backend/migrations/007_create_archive_tables.sql
   ```

4. Reset and re-migrate (development only):
   ```bash
   # WARNING: This drops all data
   npx drizzle-kit drop
   npx drizzle-kit push:pg
   ```

---

### Slow Queries

**Symptom:** API responses > 100ms

**Solutions:**

1. Check if indexes exist:
   ```sql
   SELECT indexname, tablename FROM pg_indexes
   WHERE tablename LIKE 'route_%' OR tablename LIKE 'error_%';
   ```

2. Analyze query performance:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM error_cluster WHERE route_id = 'test';
   ```

3. Update statistics:
   ```sql
   ANALYZE route_metadata;
   ANALYZE error_cluster;
   ANALYZE route_interaction_log;
   ```

4. Check connection pool:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'legal_ai_db';
   ```

---

## API Issues

### 409 Conflict - Route Not Found

**Symptom:** `Route X not found in route_metadata`

**Cause:** Trying to create error/interaction for non-existent route

**Solution:**
1. Create route metadata first:
   ```bash
   curl -X POST http://localhost:5173/api/routes/metadata \
     -H "Content-Type: application/json" \
     -d '{"route_id": "your-route", "path": "/your-route", "kind": "page"}'
   ```

2. Or check if route exists:
   ```bash
   curl http://localhost:5173/api/routes/your-route/metadata
   ```

---

### 400 Bad Request - Invalid Interaction Type

**Symptom:** `Invalid interaction_type`

**Cause:** Using unsupported interaction type

**Valid types:** `view`, `navigate`, `analyze`, `patch_apply`

**Solution:**
```typescript
// Correct
await logInteraction(routeId, 'view');

// Incorrect
await logInteraction(routeId, 'click'); // Not supported
```

---

### 500 Internal Server Error

**Symptom:** Generic server error

**Debug steps:**

1. Check server logs:
   ```bash
   npm run dev 2>&1 | grep -i error
   ```

2. Test database connection:
   ```bash
   curl http://localhost:5173/api/health
   ```

3. Check for TypeScript errors:
   ```bash
   npm run check:typescript
   ```

---

## SSE Issues

### Connection Drops

**Symptom:** SSE connection closes unexpectedly

**Solutions:**

1. Check proxy timeout settings (nginx):
   ```nginx
   proxy_read_timeout 86400s;
   proxy_send_timeout 86400s;
   ```

2. Verify headers in response:
   ```bash
   curl -v http://localhost:5173/api/routes/events
   # Should see:
   # Content-Type: text/event-stream
   # Cache-Control: no-cache
   # Connection: keep-alive
   ```

3. Implement client-side reconnection:
   ```typescript
   eventSource.onerror = () => {
     setTimeout(() => {
       eventSource = new EventSource('/api/routes/events');
     }, 5000);
   };
   ```

---

### No Events Received

**Symptom:** SSE connected but no events

**Solutions:**

1. Verify broadcaster is called:
   ```typescript
   // In health event endpoint
   console.log('Broadcasting health change:', routeId);
   await broadcastHealthChange({ routeId, oldStatus, newStatus });
   ```

2. Check for multiple instances (need Redis pub/sub for multi-instance)

3. Test with curl:
   ```bash
   # Terminal 1: Listen for events
   curl -N http://localhost:5173/api/routes/events

   # Terminal 2: Trigger event
   curl -X POST http://localhost:5173/api/routes/test/errors \
     -H "Content-Type: application/json" \
     -d '{"tool":"test","message":"test","severity":"error"}'
   ```

---

## UI Issues

### Route Cards Not Updating

**Symptom:** Health status doesn't update in real-time

**Solutions:**

1. Check SSE connection in browser DevTools:
   - Network tab → Filter by "EventStream"
   - Verify connection is open

2. Check for JavaScript errors in console

3. Verify reactive state updates:
   ```typescript
   // Ensure using $state for reactivity
   let routes = $state<Route[]>([]);

   // Update correctly
   routes = routes.map(r =>
     r.id === routeId ? { ...r, status: newStatus } : r
   );
   ```

---

### Error Count Not Showing

**Symptom:** Error count badge missing

**Solutions:**

1. Verify error clusters exist:
   ```bash
   curl http://localhost:5173/api/routes/your-route/errors
   ```

2. Check server-side enrichment:
   ```typescript
   // In +page.server.ts
   console.log('Route enrichment:', route.id, route.errorCount);
   ```

3. Verify UI conditional:
   ```svelte
   {#if route.errorCount > 0}
     <span class="error-badge">{route.errorCount}</span>
   {/if}
   ```

---

## Archival Issues

### Archival Job Not Running

**Symptom:** Old data not being archived

**Solutions:**

1. Check scheduler status:
   ```bash
   pm2 status archival-scheduler
   ```

2. Run manually:
   ```bash
   npx ts-node backend/jobs/archiveOldData.ts
   ```

3. Check job logs:
   ```bash
   tail -f /var/log/archival.log
   ```

---

### Archived Data Not Queryable

**Symptom:** `archived=true` returns empty results

**Solutions:**

1. Verify archive tables exist:
   ```sql
   SELECT COUNT(*) FROM error_cluster_archive;
   SELECT COUNT(*) FROM route_interaction_log_archive;
   ```

2. Check archive query function:
   ```typescript
   import { getCombinedErrorClusters } from '$lib/db/queries/nes-command-center-archive';

   const result = await getCombinedErrorClusters(routeId, {
     includeArchived: true
   });
   console.log('Archive result:', result);
   ```

---

## Performance Issues

### High Memory Usage

**Symptom:** Node.js process using excessive memory

**Solutions:**

1. Increase Node.js memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run dev
   ```

2. Check for memory leaks in SSE connections:
   ```typescript
   // Ensure cleanup on disconnect
   request.signal.addEventListener('abort', () => {
     clients.delete(clientId);
   });
   ```

3. Limit pagination:
   ```typescript
   const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
   ```

---

### Database Connection Pool Exhaustion

**Symptom:** `too many connections` error

**Solutions:**

1. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'legal_ai_db';
   ```

2. Adjust pool settings:
   ```typescript
   // backend/db/pool.ts
   const pool = new Pool({
     max: 20,           // Increase max connections
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 5000
   });
   ```

3. Close idle connections:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'legal_ai_db'
   AND state = 'idle'
   AND state_change < NOW() - INTERVAL '10 minutes';
   ```

---

## Getting Help

If issues persist:

1. Check existing documentation in `docs/`
2. Review integration tests for expected behavior
3. Enable debug logging:
   ```bash
   DEBUG=* npm run dev
   ```
4. Check GitHub issues for similar problems
