# Legal Taxonomy Clustering - Architecture Improvements

## 🎯 Core Principles

### 1. Three-Layer Architecture
```
┌─────────────────────────────────────────┐
│  Presentation Layer (SvelteKit UI)      │
│  - Components                           │
│  - Stores (Svelte 5 runes)             │
│  - Client-side state                    │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Application Layer (Node.js Services)   │
│  - XState machines                      │
│  - Business logic                       │
│  - Validation & safety                  │
│  - Agentic functions                    │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Data Layer (Databases & Caches)        │
│  - PostgreSQL (source of truth)         │
│  - Qdrant (semantic search)             │
│  - Redis (state & metrics)              │
│  - IndexedDB (browser cache)            │
└─────────────────────────────────────────┘
```

### 2. Tiered Semantic Pipeline
```
Query comes in
    ↓
[1] Try Qdrant (fast, semantic)
    ↓ (if miss or offline)
[2] Try pgvector (accurate, slower)
    ↓ (if offline)
[3] Use IndexedDB (browser cache)
    ↓
Return best result
```

### 3. Observable Async Work
- All clustering jobs → XState machines
- All state transitions → Observable events
- All errors → Automatic retry + rollback
- All metrics → Redis + time-series DB

### 4. Agentic Function Calling
```
User Query
    ↓
Intent Classification
    ↓
Function Schema Validation
    ↓
LLM Selects Function(s)
    ↓
Execute with Safety Checks
    ↓
Validate Output
    ↓
Return Result
```

---

## 📁 File Organization

### Backend Services Layer
```
src/lib/server/services/
├── clustering/
│   ├── xstate-machine.ts          # State machine definition
│   ├── orchestrator.ts            # Run workflow
│   ├── som-service.ts             # SOM algorithm
│   ├── kmeans-service.ts          # K-Means algorithm
│   └── change-detection.ts        # Change tracking
├── semantic-pipeline/
│   ├── qdrant-search.ts           # Tier 1: Vector search
│   ├── pgvector-search.ts         # Tier 2: Fallback
│   └── indexeddb-sync.ts          # Tier 3: Browser cache
├── agentic/
│   ├── function-registry.ts       # Function definitions
│   ├── validator.ts               # Safety validation
│   └── executor.ts                # Safe execution
└── persistence/
    ├── redis-state.ts             # State tracking
    ├── postgres-history.ts        # Change history
    └── metrics.ts                 # Performance metrics
```

### Frontend Components Layer
```
src/lib/components/legal/
├── clustering/
│   ├── ClusterBadge.svelte        # Visual badge
│   ├── ClusterDialog.svelte       # Detail modal
│   ├── ClusterFilter.svelte       # Filter UI
│   └── ClusterStats.svelte        # Metrics display
└── search/
    ├── SearchWithClusters.svelte  # Integrated search
    └── ResultsWithBadges.svelte   # Results + badges
```

### Stores Layer
```
src/lib/stores/
├── clustering/
│   ├── categories.ts              # Cluster categories
│   ├── selection.ts               # User selections
│   ├── metadata.ts                # Statute metadata
│   └── jobs.ts                    # Job tracking
└── semantic/
    ├── search-cache.ts            # Tiered cache
    └── offline.ts                 # Offline state
```

---

## 🔄 Data Flow Examples

### Example 1: Clustering Job Execution
```
RabbitMQ Event (NEW_DATA)
    ↓
XState Machine (waiting → queue → clustering → tagging → indexing → complete)
    ↓
SOM Training (100 epochs)
    ↓
K-Means Clustering (K=8)
    ↓
Change Detection
    ↓
Qdrant Payload Update
    ↓
Redis Metrics Update
    ↓
Emit Success Event
```

### Example 2: Search with Clustering
```
User Query + Cluster Filter
    ↓
Go Microservice (hybrid search)
    ↓
[Tier 1] Qdrant (semantic + cluster filter)
    ↓ (if miss)
[Tier 2] pgvector (fallback search)
    ↓ (if offline)
[Tier 3] IndexedDB (browser cache)
    ↓
Merge Results + Apply Echo Ranking
    ↓
Return to UI with Cluster Metadata
```

### Example 3: Agentic Function Calling
```
User: "Find all kidnapping statutes"
    ↓
Intent: SEARCH_BY_CATEGORY
    ↓
Function Schema: search_law_sections(category: string, limit: number)
    ↓
Validation: category ∈ ["Violent Crimes", "Property Crimes", ...]
    ↓
Execute: search_law_sections("Kidnapping", 10)
    ↓
Validate Output: All results have kmeans_label = "Kidnapping"
    ↓
Return Results
```

---

## 🛡️ Safety & Validation

### Legal Context Safety
1. **Function Registry** - Only approved functions callable
2. **Input Validation** - All parameters type-checked
3. **Output Validation** - Results match expected schema
4. **Audit Trail** - All calls logged with timestamps
5. **Rate Limiting** - Prevent abuse

### Error Handling
1. **Graceful Degradation** - Fall back to lower tiers
2. **Automatic Retry** - Exponential backoff
3. **Rollback** - Revert to previous known-good state
4. **Alerts** - Notify operators on failures

---

## 📊 Metrics & Observability

### Key Metrics
- Clustering job success rate
- Average execution time per state
- Retry count distribution
- Qdrant vs pgvector vs IndexedDB hit rates
- Echo ranking boost effectiveness
- Change detection frequency

### Logging
- State transitions
- Function calls
- Validation failures
- Performance timings
- Error details

---

## 🚀 Implementation Priority

### Phase 0 (Foundation)
1. XState machine definition
2. Qdrant payload migration
3. Taxonomy types + stores
4. CategoryBadge component

### Phase 1 (Core)
1. SOM + K-Means services
2. Change detection
3. Agentic function registry
4. Semantic pipeline (tiered search)

### Phase 2 (Integration)
1. Go microservice updates
2. UI component wiring
3. Metrics collection
4. Monitoring dashboard

### Phase 3 (Polish)
1. Performance optimization
2. Offline support (IndexedDB)
3. Advanced analytics
4. Documentation

---

## ✅ Best Practices Applied

### Code Organization
✅ Clear separation of concerns
✅ Single responsibility per file
✅ Consistent naming conventions
✅ Type-safe throughout

### State Management
✅ Svelte 5 runes for reactivity
✅ XState for complex workflows
✅ Redis for distributed state
✅ PostgreSQL for persistence

### Error Handling
✅ Try-catch with specific errors
✅ Automatic retry with backoff
✅ Rollback on failure
✅ Comprehensive logging

### Performance
✅ Tiered caching strategy
✅ Lazy loading components
✅ Streaming responses
✅ Batch operations

### Safety
✅ Input validation
✅ Output validation
✅ Audit trails
✅ Rate limiting

---

**Status**: Architecture Improvements Documented
**Next**: Implement Phase 0 files
