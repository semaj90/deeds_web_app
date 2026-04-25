# Route Map Generator - Phase 79 Codebase Intelligence

## Overview

The **Route Map Generator** (`scripts/generate-route-map.mjs`) scans your entire `src/routes/` directory and extracts comprehensive metadata about every route file for **codebase-aware Phase 79 autonomous code generation**.

## What It Extracts

### 1. Route Metadata
- **Route Path**: SvelteKit route (`/api/cases`, `/app/cases/[id]`)
- **File Location**: Relative path to source file
- **Route Type**: `endpoint`, `page-server`, `page`, `layout-server`, `layout`
- **Line Count**: File size metric

### 2. HTTP Methods
Detects all exported HTTP handlers:
- `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`

### 3. Security & Auth
Detects authentication patterns:
- `locals.user` checks
- `validateSession()` calls
- `lucia.validateSession()` usage

### 4. Validation (Zod)
Detects validation usage:
- Zod imports (`z.`, `zod.`)
- `.parse()` and `.safeParse()` calls
- Extracted schema names (`UserSchema`, `CaseSchema`)

### 5. Redis Usage
Detects caching and rate limiting:
- Rate limiting: `rateLimit()`, `redis.incr`
- Caching: `redis.get`, `redis.set`, `redis.del`

### 6. Database (Drizzle ORM)
Detects database queries:
- `db.select()`, `db.insert()`, `db.update()`, `db.delete()`
- `from()` table references
- Drizzle imports

### 7. SvelteKit Features
Detects special functions:
- `load` functions (server-side data fetching)
- `actions` exports (form handlers)

### 8. Dependencies
Auto-detects dependencies based on usage:
- `lucia-auth` (if auth detected)
- `zod` (if validation detected)
- `redis` (if rate limiting or caching)
- `drizzle-orm` (if database queries)

### 9. Imports
Captures all import statements for dependency analysis

## Output Formats

### 1. JSON File (`knowledge/route-map.json`)

```json
{
  "generated_at": "2025-12-24T12:00:00.000Z",
  "total_routes": 150,
  "summary": {
    "endpoints": 25,
    "pages": 80,
    "layouts": 10,
    "with_auth": 45,
    "with_validation": 60,
    "with_database": 70
  },
  "routes": [
    {
      "route": "/api/cases",
      "file": "src/routes/api/cases/+server.ts",
      "type": "endpoint",
      "methods": ["GET", "POST"],
      "features": {
        "auth": true,
        "validation": true,
        "rateLimit": true,
        "caching": false,
        "database": true,
        "loadFunction": false,
        "actions": false
      },
      "imports": ["$lib/server/db", "@sveltejs/kit", "zod"],
      "schemas": ["CreateCaseSchema", "QueryCasesSchema"],
      "dependencies": ["lucia-auth", "zod", "redis", "drizzle-orm"],
      "lineCount": 120
    }
  ]
}
```

### 2. Qdrant Vector Index (`codebase_routes` collection)

Each route is embedded with **embeddinggemma:latest** (768 dimensions) and indexed with:

**Vector**: Semantic embedding of route description
**Payload**:
```json
{
  "source": "codebase",
  "type": "route",
  "route": "/api/cases",
  "file": "src/routes/api/cases/+server.ts",
  "routeType": "endpoint",
  "methods": ["GET", "POST"],
  "features": { "auth": true, "validation": true, ... },
  "dependencies": ["lucia-auth", "zod", "redis", "drizzle-orm"],
  "schemas": ["CreateCaseSchema"],
  "indexed_at": "2025-12-24T12:00:00.000Z"
}
```

## Usage

### Run with Both Outputs (JSON + Qdrant)
```bash
npm run route-map
```

### Run JSON-Only (Skip Qdrant Indexing)
```bash
npm run route-map:json-only
```

### Direct Script Execution
```bash
# Full scan with indexing
node scripts/generate-route-map.mjs

# JSON only
node scripts/generate-route-map.mjs --skip-index
```

## Example Output

```
🗺️  Route Map Generator - Phase 79 Codebase Scanner

📂 Scanning routes in: src/routes
✅ Found 150 route files

💾 Saved route map: knowledge/route-map.json
   25 endpoints, 80 pages, 10 layouts

🔍 Indexing routes to Qdrant...
   Indexed: /api/cases/[id]                (endpoint)
   Indexed: /app/cases/[id]                (page-server)
✅ Indexed 150/150 routes to Qdrant: codebase_routes

📊 Route Map Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   endpoint                  25
   page-server               45
   page                      65
   layout-server              8
   layout                     7

📈 Feature Usage:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Authentication (lucia)     ██████████████           45 (30%)
   Validation (Zod)           ████████████████████     60 (40%)
   Rate Limiting              ████████                 25 (17%)
   Caching (Redis)            ██████                   18 (12%)
   Database (Drizzle)         ██████████████████████████ 70 (47%)
   Load Functions             ████████████████████     55 (37%)
   Form Actions               ████████                 22 (15%)

🎯 Top Routes by Complexity (features used):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   /api/cases/[id]                (6 features)
      └─ auth, validation, rateLimit, caching, database, loadFunction
   /api/reports                   (5 features)
      └─ auth, validation, rateLimit, database, loadFunction
   /app/cases/[id]                (5 features)
      └─ auth, validation, database, loadFunction, actions
```

## Phase 79 Integration

### How Phase 79 Uses Route Map

**1. Codebase-Aware Queries**
```javascript
// User request: "Create an authenticated API endpoint like the cases endpoint"

// Phase 79 retrieves:
const existingRoute = await qdrantClient.search({
  collection: 'codebase_routes',
  query: 'authenticated API endpoint with validation',
  filter: {
    must: [
      { key: 'features.auth', match: { value: true } },
      { key: 'features.validation', match: { value: true } },
      { key: 'routeType', match: { value: 'endpoint' } }
    ]
  },
  limit: 3
});

// Returns: /api/cases/+server.ts (auth + validation + rate limiting + database)
// Phase 79 generates new endpoint using actual project patterns
```

**2. Pattern Detection**
Phase 79 can answer:
- "Which endpoints use rate limiting?" → Filter `features.rateLimit: true`
- "Show me all protected routes" → Filter `features.auth: true`
- "What validation schemas exist?" → Extract from `schemas` array
- "Which routes access the database?" → Filter `features.database: true`

**3. Dependency Awareness**
Phase 79 knows what's already imported:
- "The project uses `lucia-auth` for auth (seen in 45 routes)"
- "Zod validation is standard (60 routes use it)"
- "Rate limiting is implemented with Redis (25 routes)"

**4. Complexity Analysis**
Phase 79 can prioritize similar routes:
- "Most complex endpoints have 6+ features (auth + validation + rate limiting + caching + database + load)"
- "Simple pages typically have 2-3 features (auth + database + load)"

## Security Policy Integration

When Phase 79 detects **security keywords** in a request:
- `auth`, `session`, `cookie`, `csrf`, `upload`, `presign`, `rate limit`, `validation`

It retrieves:
1. **Security Patterns**: Protected endpoints from knowledge base
2. **Actual Implementation**: Similar routes from codebase
3. **Minimum Coverage**: Forces security + validation + operational chunks

Example:
```javascript
// Request: "Create file upload endpoint"
// Phase 79 retrieves:
// - KB: file-uploads-presigned.md (Pattern Suite)
// - Codebase: /api/upload/presign (actual implementation)
// - Generates: New endpoint with auth + rate limiting + validation + CORS
```

## Route Type Patterns

### Endpoints (`+server.ts`)
- Export HTTP methods: `GET`, `POST`, `PUT`, `DELETE`
- Return `json()` responses
- Typically have: auth, validation, rate limiting, database

### Page Servers (`+page.server.ts`)
- Export `load` function for SSR data fetching
- Export `actions` for form handling
- Typically have: auth, database, validation

### Pages (`+page.svelte`)
- Client-side Svelte components
- May import from `$page` store
- Less commonly have features (mostly UI)

### Layout Servers (`+layout.server.ts`)
- Shared `load` functions for nested routes
- Typically have: auth check, user session loading

## Troubleshooting

### Issue: "Ollama embedding unavailable"
**Cause**: Ollama not running or embeddinggemma:latest not loaded
**Solution**:
```bash
ollama serve           # Start Ollama
ollama pull embeddinggemma:latest  # Download model
npm run route-map     # Retry
```

### Issue: "Qdrant indexing failed"
**Cause**: Qdrant not running on localhost:6333
**Solution**:
```bash
docker run -p 6333:6333 qdrant/qdrant  # Start Qdrant
npm run route-map                     # Retry
```

### Issue: "Want JSON only without Qdrant"
**Solution**:
```bash
npm run route-map:json-only
```

## Files Generated

| File | Purpose | Size |
|------|---------|------|
| `knowledge/route-map.json` | Searchable JSON index of all routes | ~50-100KB |
| Qdrant `codebase_routes` | Vector embeddings for semantic search | ~150 points |

## Next Steps

1. **Run Initial Scan**:
   ```bash
   npm run route-map
   ```

2. **Verify Qdrant Collection**:
   ```bash
   curl http://localhost:6333/collections/codebase_routes
   ```

3. **Test Phase 79 Retrieval**:
   ```bash
   npm run phase79:engine
   # Query: "API endpoint with auth and validation"
   ```

4. **Implement Policy-First Retrieval**:
   - Update `scripts/phase79-cognitive-engine.mjs`
   - Add codebase route retrieval for security keywords
   - Force minimum coverage with actual project patterns

## Benefits for Phase 79

✅ **Codebase-Aware**: Knows what routes exist and how they're implemented
✅ **Pattern Detection**: Identifies common patterns (auth + validation + rate limiting)
✅ **Dependency Tracking**: Knows what libraries are actually used
✅ **Complexity Metrics**: Can prioritize similar routes for reference
✅ **Real Implementations**: Provides actual code examples from your project
✅ **Security Coverage**: Ensures generated code follows project standards
✅ **Zero Hallucination**: Only uses patterns that exist in your codebase

---

**Last Updated**: December 24, 2025
**Phase 79 Ready**: ✅
**Qdrant Collection**: `codebase_routes` (768 dimensions)
**Script**: `scripts/generate-route-map.mjs`
**NPM Commands**: `npm run route-map`, `npm run route-map:json-only`
