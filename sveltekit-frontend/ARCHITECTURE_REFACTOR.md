# SvelteKit 2 Architecture Refactoring Plan

## 🎯 Goals
1. **SSR-First**: Move from API-centric to SSR load functions
2. **Progressive Enhancement**: Forms work without JavaScript
3. **Type Safety**: Leverage SvelteKit's `$types` generation
4. **Performance**: Reduce HTTP round-trips, improve initial page load
5. **Maintainability**: Centralize auth, reduce code duplication

## 📊 Current State
- **API Endpoints**: 4,175 files (`+server.ts`)
- **SSR Load Functions**: 264 files (`+page.server.ts`)
- **Ratio**: 16:1 (API-heavy, not optimal)

## ✅ Refactoring Priorities

### 1. Consolidate Duplicate Routes ✅ IN PROGRESS
**Issue**: `/cases/create` AND `/cases/new` both exist

**Solution**: Keep `/cases/new` (RESTful convention), delete `/cases/create`

**Migration**:
- ✅ Merge functionality from both routes
- ✅ Convert to form actions (not `fetch()`)
- ✅ Add progressive enhancement
- ✅ Update internal links

### 2. Convert WebSocket → SSE for Contextual Chat
**Issue**: WebSocket requires persistent connections, SSE is simpler for server→client streaming

**Routes to Update**:
- `/api/ws` → `/api/chat/stream` (SSE)
- `/api/evidence/ws` → `/api/evidence/stream` (SSE)

**Benefits**:
- ✅ Auto-reconnect
- ✅ Works over HTTP/2
- ✅ Simpler error handling
- ✅ EventSource API (built-in browser support)

### 3. Separate User Functions & SDK (RAG/KAG/DAG)
**Issue**: Mixed concerns - user CRUD + AI operations in same endpoints

**New Structure**:
```
lib/
├── sdk/
│   ├── rag/          # Retrieval Augmented Generation
│   ├── kag/          # Knowledge Augmented Generation
│   └── dag/          # Data Augmented Generation
├── server/
│   ├── services/     # User CRUD operations
│   └── ai/           # AI orchestration (uses SDK)
```

### 4. High-Traffic API → SSR Conversion

#### Phase 1: Cases Module
**Before**: `/api/cases` (GET) + client `fetch()`
**After**: `/cases/+page.server.ts` with `load()` function

#### Phase 2: Evidence Module
**Before**: `/api/evidence` (GET) + client `fetch()`
**After**: `/evidence/+page.server.ts` with `load()` function

#### Phase 3: Search
**Before**: `/api/search` (POST) + client `fetch()`
**After**: `/search/+page.server.ts` with `load()` + form action

## 🚀 Implementation Plan

### Week 1: Foundation
- [x] Document current architecture
- [ ] Set up SSE endpoint template
- [ ] Create SDK structure (`lib/sdk/{rag,kag,dag}`)
- [ ] Consolidate `/cases/new` and `/cases/create`

### Week 2: Cases Module
- [ ] Convert `/cases` to SSR load function
- [ ] Convert case creation to form actions
- [ ] Add progressive enhancement
- [ ] Update tests

### Week 3: Chat & Real-time
- [ ] Implement SSE for contextual chat
- [ ] Replace WebSocket with SSE
- [ ] Add reconnection logic
- [ ] Update client components

### Week 4: SDK & Type Safety
- [ ] Extract RAG logic to `lib/sdk/rag/`
- [ ] Extract KAG logic to `lib/sdk/kag/`
- [ ] Extract DAG logic to `lib/sdk/dag/`
- [ ] Generate TypeScript types

## 📈 Expected Outcomes

### Performance
- ⚡ **30-50% faster** initial page loads
- ⚡ **Reduced server load** (fewer HTTP requests)
- ⚡ **Better caching** (HTTP caching on load data)

### Developer Experience
- ✅ **Type safety** with `$types` autogeneration
- ✅ **Less boilerplate** (no `fetch()`, `json()` everywhere)
- ✅ **Centralized auth** in `hooks.server.ts`

### SEO & Accessibility
- 🔍 **Full SSR** (data in initial HTML)
- ♿ **Progressive enhancement** (works without JS)
- 🚀 **Improved Core Web Vitals**

## 📝 Migration Checklist

- [ ] Consolidate duplicate routes
- [ ] Convert high-traffic endpoints to SSR
- [ ] Implement SSE for real-time features
- [ ] Separate SDK from user functions
- [ ] Update documentation
- [ ] Run full test suite
- [ ] Performance benchmark (before/after)
- [ ] Deploy to staging
- [ ] Monitor error rates
- [ ] Deploy to production

## 🎓 Learning Resources
- [SvelteKit Docs: Loading Data](https://kit.svelte.dev/docs/load)
- [SvelteKit Docs: Form Actions](https://kit.svelte.dev/docs/form-actions)
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Drizzle ORM: Best Practices](https://orm.drizzle.team/docs/overview)
