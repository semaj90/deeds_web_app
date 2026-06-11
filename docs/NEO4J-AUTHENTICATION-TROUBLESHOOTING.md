# Neo4j Authentication Troubleshooting (Phase 4B Task 2)

**Issue**: `[bolt-271] The client is unauthorized due to authentication failure.` when connecting to Neo4j

**Seen in logs**: `2026-06-11 22:52:27.168+0000 WARN  [bolt-271] The client is unauthorized due to authentication failure.`

---

## Root Cause

Neo4j 5.26 Docker images set a random password on first startup (security feature). The log entry `"Changed password for user 'neo4j'"` during container initialization means the default `neo4j:neo4j` or `neo4j:neo4j123` password was replaced with an auto-generated one.

The SvelteKit code tries to authenticate with `NEO4J_PASSWORD` from `.env` (defaults to `neo4j123`), but the container has a different password.

---

## Quick Fix (3 steps)

### Step 1: Find the Actual Password

Check the Neo4j container logs for the password it set:

```bash
docker logs legal-ai-neo4j | grep -i "password\|changed\|initializing"
```

Look for lines like:
```
Changed password for user 'neo4j'. IMPORTANT: this change will only take effect if performed before the database is started for the first time.
```

Or check the environment variables passed to the container:

```bash
docker inspect legal-ai-neo4j | grep -A 10 "Env"
```

### Step 2: Check Current .env Values

```bash
grep NEO4J sveltekit-frontend/.env | head -5
```

You should see:
```
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=???
```

### Step 3: Set Correct Password (Pick ONE Option)

#### Option A: Reset Password in Container (Fastest)

```bash
# Connect to Neo4j and reset password to a known value
docker exec legal-ai-neo4j cypher-shell -u neo4j -p "INITIAL_PASSWORD" \
  'ALTER USER neo4j SET PASSWORD "neo4j123"'
```

Replace `INITIAL_PASSWORD` with whatever the container is using (check Step 1).

Then update `.env`:
```bash
echo 'NEO4J_PASSWORD=neo4j123' >> sveltekit-frontend/.env
```

#### Option B: Use Docker Compose to Set Password

In `docker-compose.yml`, add to the `neo4j` service:

```yaml
neo4j:
  image: neo4j:5.26-enterprise
  environment:
    NEO4J_AUTH: neo4j/neo4j123  # <-- Forces password on startup
    NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes"
  # ... rest of config
```

Then rebuild:
```bash
docker-compose down legal-ai-neo4j
docker-compose up -d legal-ai-neo4j
```

#### Option C: Extract Auto-Generated Password

If you don't know the password, extract it from the container's startup:

```bash
# Get all environment variables
docker inspect legal-ai-neo4j | jq '.[] | .[].Config.Env'

# Or search the startup transcript
docker logs legal-ai-neo4j 2>&1 | head -100 | grep -E "password|NEO4J_AUTH"
```

---

## Verify Connection Works

Run the diagnostic script:

```bash
bash scripts/diagnose-neo4j.sh
```

Expected output:
```
✅ Container: legal-ai-neo4j is RUNNING
✅ Bolt port 7687 is OPEN
✅ HTTP port 7474 is OPEN
✅ Authentication: neo4j:neo4j123 WORKS
✅ Neo4j Version: 5.26.19
✅ GDS is INSTALLED
✅ All checks passed!
```

---

## Testing Neo4j Graph Signal

Once authentication is fixed, test Phase 4B Task 2:

```bash
# In SvelteKit directory
cd sveltekit-frontend
npm run dev

# In another terminal, test the RRF endpoint
curl -X POST http://localhost:5173/api/search/rrf \
  -H "Content-Type: application/json" \
  -d '{"query":"test query with concepts"}'
```

Look for `"neoCount": N` in the response. If `N > 0`, Neo4j signal is working.

---

## Debugging Neo4j Directly

If the password still doesn't work, connect directly to Neo4j browser:

**HTTP**: http://localhost:7474/browser/  
**Bolt**: `neo4j://localhost:7687`  
**Username**: `neo4j`  
**Password**: (whatever you set in Step 3)

Then run Cypher directly:

```cypher
// Check if edges exist
MATCH ()-[r:USED_CONCEPT|SIMILAR]->() RETURN count(r) AS edgeCount;

// Check Concept nodes
MATCH (c:Concept) RETURN count(c) AS conceptCount;

// Check Packet nodes
MATCH (p:Packet) RETURN count(p) AS packetCount;
```

If all return 0, the graph is empty and Task 2 will return empty results until data is seeded.

---

## Common Issues & Solutions

| Error | Cause | Fix |
|-------|-------|-----|
| `unauthorized` | Wrong password | Use Step 3 to reset |
| `Connection refused` | Port not open | Check `docker-compose ps` |
| `0 edges returned` | Graph is empty | Seed data with sync scripts |
| `GDS not available` | Plugin failed to install | Restart container, check logs |

---

## Environment Variables (Reference)

**File**: `sveltekit-frontend/.env`

```
# Neo4j Connection
NEO4J_URI=bolt://127.0.0.1:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4j123

# Neo4j Database
NEO4J_DATABASE=neo4j
```

**Fallback defaults** (in `env.server.ts`):
```typescript
NEO4J_URI: privateEnv.NEO4J_URI ?? `bolt://${LOOPBACK_IP}:7687`,
NEO4J_USER: privateEnv.NEO4J_USER ?? 'neo4j',
NEO4J_PASSWORD: privateEnv.NEO4J_PASSWORD ?? 'neo4j123',
```

---

## Next Steps (Phase 4B Task 2)

Once authentication is confirmed working:

1. ✅ Neo4j graph signal module is ready (`neo4j-graph-signal.ts`)
2. ✅ Health check function available (`checkNeo4jHealth()`)
3. ✅ Query function ready (`queryNeoJsGraphSignal(conceptIds)`)
4. [ ] Wire into `rrf-integration.ts` (Integration tests step)
5. [ ] Test via API endpoint

---

## References

- Neo4j Security: https://neo4j.com/docs/operations-manual/current/authentication/
- Docker Neo4j: https://hub.docker.com/_/neo4j
- `neo4j-driver.ts`: `sveltekit-frontend/src/lib/server/neo4j-driver.ts`
- `neo4j-graph-signal.ts`: `sveltekit-frontend/src/lib/server/retrieval/neo4j-graph-signal.ts` (NEW)
