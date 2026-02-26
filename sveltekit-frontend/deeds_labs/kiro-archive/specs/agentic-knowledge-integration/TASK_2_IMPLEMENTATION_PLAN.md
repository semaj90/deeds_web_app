# Task 2: Update Tool Implementations - Implementation Plan

**Date:** December 20, 2025
**Status:** 🔄 In Progress
**Goal:** Wire `rag_lookup` tool to use mock infrastructure in test environment

---

## 🎯 Problem Analysis

### Current State
The `rag_lookup` tool in `tools.ts` uses real services:
1. **Redis Cache** - `redisCache.get()` and `redisCache.set()`
2. **Ollama** - `generateEmbedding(query)`
3. **Qdrant** - `fetch()` to Qdrant API

### Test Results
- ✅ 6/10 tests passing
- ⚠️ 4/10 tests failing:
  1. should return results sorted by similarity score in descending order
  2. should respect topK parameter for result limiting
  3. should include payload data in results
  4. should handle concurrent queries correctly

### Root Cause
The tool doesn't use mocks in test environment - it tries to call real services via `fetch()`, which returns empty results.

---

## 🔧 Solution Approach

### Option 1: Environment Detection (RECOMMENDED)
Detect test environment and use mocks conditionally:

```typescript
// At top of tools.ts
const isTestEnv = process.env.NODE_ENV === 'test';

// Import mocks conditionally
let mockQdrant, mockRedis, mockOllama;
if (isTestEnv) {
  const mocks = await import('$lib/test-utils/mocks');
  mockQdrant = mocks.mockQdrant;
  mockRedis = mocks.mockRedis;
  mockOllama = mocks.mockOllama;
}

// In rag_lookup tool
if (isTestEnv) {
  // Use mockRedis.get()
  // Use mockOllama.generateEmbedding()
  // Use mockQdrant.search()
} else {
  // Use real services
}
```

**Pros:**
- ✅ Clean separation of test/production code
- ✅ No changes to test files
- ✅ Easy to understand

**Cons:**
- ⚠️ Adds conditional logic to production code
- ⚠️ Slightly more complex

### Option 2: Dependency Injection
Pass services as parameters:

```typescript
rag_lookup: async (args, services = realServices) => {
  // Use services.redis, services.qdrant, services.ollama
}
```

**Pros:**
- ✅ Clean architecture
- ✅ Easy to test

**Cons:**
- ⚠️ Requires changing tool signature
- ⚠️ More refactoring needed

### Option 3: Global Mock Override
Override global `fetch` in test setup:

```typescript
// In setup.ts
global.fetch = mockFetch.getMockFetch();
```

**Pros:**
- ✅ No changes to tools.ts
- ✅ Simple

**Cons:**
- ⚠️ Already implemented but not working for Qdrant
- ⚠️ Doesn't handle Redis/Ollama

---

## ✅ Recommended Solution: Hybrid Approach

Combine Option 1 (environment detection) with Option 3 (global fetch override):

### Step 1: Enhance `setup.ts` to Mock Qdrant Endpoint
```typescript
// In initializeFetchMocks()
mockFetch.setResponse('localhost:6333/collections/knowledge/points/search', {
  status: 200,
  data: {
    result: [
      { id: 1, score: 0.9, payload: { ... } },
      { id: 2, score: 0.8, payload: { ... } }
    ]
  }
});
```

### Step 2: Create Mock Redis Cache Class
```typescript
// In tools.ts, detect test environment
class TestRedisCache {
  async get(key: string) {
    return mockRedis.get(key);
  }
  async set(key: string, value: any, ttl: number) {
    return mockRedis.set(key, JSON.stringify(value), { EX: ttl });
  }
}

const redisCache = isTestEnv ? new TestRedisCache() : new RedisCache();
```

### Step 3: Mock `generateEmbedding` Function
```typescript
// In tools.ts
const generateEmbeddingFn = isTestEnv
  ? async (query: string) => mockOllama.generateEmbedding(query)
  : generateEmbedding;
```

---

## 📋 Implementation Steps

### Step 1: Update `setup.ts` - Enhance Fetch Mocking
Add Qdrant endpoint mocking to `initializeFetchMocks()`:

```typescript
// Mock Qdrant search endpoint
mockFetch.setResponse('localhost:6333/collections/knowledge/points/search', {
  status: 200,
  data: {
    result: mockQdrant.collections.get('knowledge')?.points || []
  }
});
```

### Step 2: Update `tools.ts` - Add Environment Detection
```typescript
// At top of file
const isTestEnv = process.env.NODE_ENV === 'test';

// Import mocks if in test environment
let testMocks: any = null;
if (isTestEnv) {
  // Dynamic import to avoid loading mocks in production
  testMocks = await import('$lib/test-utils/mocks');
}
```

### Step 3: Update `RedisCache` Class
```typescript
class RedisCache {
  async get(key: string): Promise<any | null> {
    if (isTestEnv && testMocks) {
      const value = await testMocks.mockRedis.get(key);
      return value ? JSON.parse(value) : null;
    }
    // Real Redis implementation
    // ...
  }

  async set(key: string, value: any, ttl: number): Promise<boolean> {
    if (isTestEnv && testMocks) {
      return testMocks.mockRedis.set(key, JSON.stringify(value), { EX: ttl });
    }
    // Real Redis implementation
    // ...
  }
}
```

### Step 4: Update `generateEmbedding` Calls
```typescript
// In rag_lookup tool
const embedding = await withRetry(
  () => {
    if (isTestEnv && testMocks) {
      return testMocks.mockOllama.generateEmbedding(query);
    }
    return generateEmbedding(query);
  },
  'RAG embedding generation',
  2
);
```

---

## 🧪 Testing Strategy

### Test 1: Verify Mock Detection
```typescript
it('should use mocks in test environment', () => {
  expect(process.env.NODE_ENV).toBe('test');
  expect(testMocks).toBeDefined();
});
```

### Test 2: Verify Qdrant Mock
```typescript
it('should return mocked Qdrant results', async () => {
  await mockQdrant.upsert('knowledge', {
    points: [{ id: 1, vector: [...], payload: { title: 'Test' } }]
  });

  const result = await toolRegistry.rag_lookup({ query: 'test', topK: 1 });

  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].title).toBe('Test');
});
```

### Test 3: Verify Redis Mock
```typescript
it('should use Redis cache in tests', async () => {
  // First call - should miss cache
  const result1 = await toolRegistry.rag_lookup({ query: 'test', topK: 1 });

  // Second call - should hit cache
  const result2 = await toolRegistry.rag_lookup({ query: 'test', topK: 1 });

  expect(result1).toEqual(result2);
});
```

### Test 4: Verify Ollama Mock
```typescript
it('should use mocked embeddings', async () => {
  const spy = vi.spyOn(mockOllama, 'generateEmbedding');

  await toolRegistry.rag_lookup({ query: 'test', topK: 1 });

  expect(spy).toHaveBeenCalledWith('test');
});
```

---

## 📊 Success Criteria

### Before Implementation
- ⚠️ 6/10 tests passing
- ⚠️ 4/10 tests failing
- ⚠️ Tool uses real services in tests

### After Implementation
- ✅ 10/10 tests passing
- ✅ Tool uses mocks in test environment
- ✅ Tool uses real services in production
- ✅ No changes to test files needed

---

## 🚀 Alternative: Simpler Approach

If the above is too complex, we can use a **simpler approach**:

### Just Fix the Fetch Mock

The `mockFetch` is already set up in `setup.ts`, but it's not matching the Qdrant URL pattern. We just need to fix the pattern matching:

```typescript
// In setup.ts - initializeFetchMocks()
mockFetch.setResponse('http://localhost:6333/collections/knowledge/points/search', {
  status: 200,
  data: {
    result: [] // Will be populated by mockQdrant
  }
});
```

Then update `mockFetch.getMockFetch()` to:
1. Check if URL matches Qdrant pattern
2. If yes, query `mockQdrant` and return results
3. If no, return configured response

This way:
- ✅ No changes to `tools.ts`
- ✅ Minimal changes to `setup.ts`
- ✅ Tests work automatically

---

## 🎯 Recommended Next Steps

1. **Try Simpler Approach First** (30 minutes)
   - Fix `mockFetch` to properly intercept Qdrant calls
   - Update pattern matching in `getMockFetch()`
   - Run tests to verify

2. **If That Doesn't Work, Use Hybrid Approach** (1-2 hours)
   - Add environment detection to `tools.ts`
   - Wire mocks conditionally
   - Update `RedisCache` class
   - Run tests to verify

3. **Document the Solution** (15 minutes)
   - Update `TASK_2_COMPLETE.md`
   - Update `STATUS.md`
   - Create usage examples

---

**Status:** 🔄 Ready to implement
**Estimated Time:** 30 minutes - 2 hours
**Next:** Choose approach and implement
