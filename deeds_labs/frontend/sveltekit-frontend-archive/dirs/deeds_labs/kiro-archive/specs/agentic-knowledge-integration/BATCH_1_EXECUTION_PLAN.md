# Batch 1 Execution Plan - Service Tests

## 🎯 Objective

Update 30+ service test files in `src/lib/services/error-analysis/` to use the new mock infrastructure.

---

## ✅ Prerequisites Complete

- Mock infrastructure validated ✅
- Initial 4 files passing at 100% ✅
- Standard pattern proven ✅
- All fixes documented ✅

---

## 📋 Batch 1 Files (Priority Order)

### High Priority (Core Services)
1. [ ] `error-analysis-pipeline.test.ts` - Main pipeline integration
2. [ ] `error-brain-api.test.ts` - Error brain API client
3. [ ] `agentic-analyzer.test.ts` - Agentic analysis service
4. [ ] `ace-context-manager.test.ts` - ACE context management

### Medium Priority (Analysis Services)
5. [ ] `pattern-matcher.test.ts` - Pattern matching
6. [ ] `similarity-calculator.test.ts` - Similarity calculations
7. [ ] `cluster-analyzer.test.ts` - Error clustering
8. [ ] `context-builder.test.ts` - Context building
9. [ ] `fix-generator.test.ts` - Fix generation
10. [ ] `validation-service.test.ts` - Validation logic

### Lower Priority (Supporting Services)
11. [ ] `error-logger.test.ts` - Error logging
12. [ ] `metrics-collector.test.ts` - Metrics collection
13. [ ] `cache-manager.test.ts` - Cache management
14. [ ] `retry-handler.test.ts` - Retry logic
15. [ ] `circuit-breaker.test.ts` - Circuit breaker

... and 15+ more service test files

---

## 🔄 Standard Update Process

### For Each File:

#### 1. Read the File
```bash
# Understand current test structure
code sveltekit-frontend/src/lib/services/error-analysis/<filename>.test.ts
```

#### 2. Apply Standard Pattern
```typescript
// Add imports
import { setupTest, cleanupTest } from '$lib/test-utils/setup';

// Update beforeEach
beforeEach(async () => {
  await setupTest();
  // existing setup...
});

// Update afterEach
afterEach(async () => {
  await cleanupTest();
});

// Remove manual mocks
// ❌ Delete: global.fetch = vi.fn()
// ❌ Delete: const mockQdrant = { ... }
// ❌ Delete: const mockRedis = { ... }
```

#### 3. Simplify Test Logic
```typescript
// ✅ Use provided mocks
import { mockQdrant, mockRedis, mockOllama } from '$lib/test-utils/setup';

// Mocks are pre-initialized and ready
```

#### 4. Run Tests
```bash
npm run test:run src/lib/services/error-analysis/<filename>.test.ts
```

#### 5. Fix Any Issues
- Check for missing collections
- Verify API format compatibility
- Fix floating-point precision
- Remove timing assertions

#### 6. Update Progress
- Mark file as complete in `TASK_1_3_PROGRESS.md`
- Update completion percentage
- Document any new patterns

---

## 🚨 Common Issues & Solutions

### Issue 1: Missing Qdrant Collection
**Symptom**: `Collection <name> does not exist`

**Solution**: Add to `setup.ts`:
```typescript
await mockQdrant.createCollection('<name>', {
  vectors: { size: 384 }
});
```

### Issue 2: Wrong API Format
**Symptom**: `Invalid response: no <field> returned`

**Solution**: Check implementation, update mock in `setup.ts`:
```typescript
mockFetch.setResponse('endpoint', {
  status: 200,
  data: { /* correct format */ }
});
```

### Issue 3: Floating-Point Precision
**Symptom**: `expected 1.0000000000000073 to be <= 1`

**Solution**: Use tolerance:
```typescript
expect(value).toBeLessThanOrEqual(1.0001);
// or
expect(value).toBeCloseTo(1.0, 5);
```

### Issue 4: Flaky Timing Tests
**Symptom**: Intermittent failures with timing assertions

**Solution**: Remove timing, test functionality:
```typescript
// ❌ Remove
expect(duration2).toBeLessThan(duration1);

// ✅ Keep
expect(result1).toEqual(result2);
```

---

## 📊 Progress Tracking

### Completion Metrics
- **Files per hour**: ~6-12 files (5-10 min each)
- **Batch 1 estimate**: 2.5-5 hours for 30 files
- **Daily target**: 15-20 files

### Update After Each File
```markdown
## Completed Files ✅
- [x] error-analysis-pipeline.test.ts (X tests passing)
- [x] error-brain-api.test.ts (X tests passing)
...

**Progress**: X/116 files (X.X%)
**Pass Rate**: X/X tests (100%)
```

---

## 🎯 Success Criteria

- [ ] All Batch 1 files updated (30+ files)
- [ ] 100% pass rate maintained
- [ ] No manual mocks remaining
- [ ] Proper cleanup in all files
- [ ] Tests run in isolation
- [ ] Documentation updated

---

## 📝 Commands Reference

```bash
# List all service test files
Get-ChildItem -Path sveltekit-frontend/src/lib/services/error-analysis -Filter "*.test.ts"

# Run specific test
npm run test:run src/lib/services/error-analysis/<filename>.test.ts

# Run all service tests
npm run test:run src/lib/services/error-analysis/

# Run all tests
npm run test:run

# Watch mode
npm run test src/lib/services/error-analysis/<filename>.test.ts
```

---

## 🚀 Next Actions

1. **Start with first file**: `error-analysis-pipeline.test.ts`
2. **Apply standard pattern**
3. **Run tests and verify**
4. **Document any issues**
5. **Move to next file**

---

## 📚 Knowledge Base Integration

As we update tests, we'll also integrate knowledge about:

- **NES Command Center**: Routes, components, state management
- **ACE (Autonomous Coding Engine)**: Context management, planning
- **Phase 72**: Error analysis, topology, brain integration
- **All Routes**: API endpoints, server routes, page routes
- **Layouts**: App layouts, auth layouts, admin layouts
- **Server Files**: API handlers, hooks, middleware
- **TypeScript Patterns**: Type definitions, interfaces, utilities
- **Svelte 5 Patterns**: Runes, reactivity, component architecture

This knowledge will be captured in test documentation and can be used to improve the AI model's understanding of the codebase.

---

**Status**: ✅ Ready to Execute
**Next File**: `error-analysis-pipeline.test.ts`
**Command**: `npm run test:run src/lib/services/error-analysis/error-analysis-pipeline.test.ts`
