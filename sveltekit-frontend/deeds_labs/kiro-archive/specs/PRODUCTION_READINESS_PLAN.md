# Legal AI Platform - Production Readiness Plan

**Date:** December 21, 2025
**Goal:** Wire up all incomplete specs for production deployment
**Status:** Planning Phase

---

## Executive Summary

This plan consolidates all incomplete spec tasks into a cohesive production readiness roadmap. We have 3 major specs with incomplete tasks that need to be wired together:

1. **NES Command Center DB Wiring** - 28 incomplete tasks (Phases 1, 6-7, 10-14)
2. **Agentic Error Analysis & Diffs** - 22 incomplete tasks (Phases 2-7)
3. **Agentic Knowledge Integration** - 12 incomplete tasks (Tasks 2-13)

---

## Current State Analysis

### ✅ Complete Specs (Production Ready)
- **ACE Web Ingestion** - 88% complete, production ready (just needs deployment)
- **Case Notes Feature** - Complete
- **Legal Dashboard Progress UI** - Complete
- **Legal Search System** - Complete
- **Svelte5 Bits UI Migration** - Complete
- **Multi-Source Retrieval Topology** - Complete
- **Error Brain Legal AI Separation** - Phases 4-5 complete

### 🟡 Partially Complete (Need Wiring)
1. **NES Command Center DB Wiring** - 28/56 tasks incomplete
   - ✅ Phases 2-5, 8-9 complete (API endpoints, client integration)
   - ❌ Phase 1 incomplete (database schema)
   - ❌ Phases 6-7 incomplete (server-side loading, interaction logging)
   - ❌ Phases 10-14 incomplete (real-time, archival, testing, docs)

2. **Agentic Error Analysis & Diffs** - 22/36 tasks incomplete
   - ✅ Phase 1 complete (error extraction, clustering)
   - ✅ Phase 6 complete (progress tracking)
   - ❌ Phases 2-5 incomplete (RAG, LLM, diffs, feature flags)
   - ❌ Phase 7 incomplete (documentation, hardening)

3. **Agentic Knowledge Integration** - 12/13 tasks incomplete
   - ✅ Task 1.1 complete (mock infrastructure)
   - ✅ Task 1.3 partial (1/116 test files updated)
   - ❌ Tasks 2-13 incomplete (test fixes, Docker, tools, CLI, MCP, docs)

### ⬜ Specs Not Started (Lower Priority)
- Advanced Multimodal Retriever
- API Cleanup Corruption Fix
- Case Reporter Summarizer
- Citation Intelligence Expansion
- Evidence CRUD RAG Integration
- Evidence Processing Pipeline
- Knowledge Search Engine
- Legal CRUD Admin
- Person of Interest Feature
- Phase 13 Agentic Tool Calling
- Phase 70-75 (various)
- RAG Enhancement System
- Svelte5 Migration Cleanup
- Svelte5 UI Error Resolution
- YoRHa Detective Screens

---

## Production Readiness Priorities

### Priority 1: Core Infrastructure (CRITICAL)
**Goal:** Get database, error handling, and knowledge integration working

#### 1.1 NES Command Center - Database Foundation
**Tasks:** Phase 1 (5 tasks)
- [ ] 1. Create Drizzle ORM schema definitions
- [ ] 1.1 Implement Drizzle migration generator
- [ ] 1.2 Write property test for migration execution
- [ ] 1.3 Create database connection pool
- [ ] 1.4 Create database query helpers
- [ ] 1.5 Write unit tests for database queries

**Why Critical:** All route tracking, error clustering, and health monitoring depend on this schema.

**Estimated Time:** 8-12 hours

#### 1.2 Agentic Knowledge Integration - Test Infrastructure
**Tasks:** Tasks 1.2, 2 (2 tasks)
- [ ] 1.2 Create test setup and teardown utilities
- [ ] 2. Checkpoint - Verify Test Fixes (run all tests)

**Why Critical:** 83 failing tests block all other development. Must fix before proceeding.

**Estimated Time:** 4-6 hours

---

### Priority 2: Error Production Help (HIGH)
**Goal:** Wire up error analysis, clustering, and automated fixes

#### 2.1 Agentic Error Analysis - RAG Integration
**Tasks:** Phase 2 (5 tasks)
- [ ] 6. Implement RAG context retriever
- [ ] 6.1 Write property tests for RAG retrieval
- [ ] 7. Create knowledge base integration
- [ ] 7.1 Write unit tests for knowledge base
- [ ] 8. Implement context formatting
- [ ] 8.1 Write property tests for context formatting
- [ ] 9. Checkpoint - Ensure all tests pass

**Why High:** Enables intelligent error analysis with historical context.

**Estimated Time:** 10-15 hours

#### 2.2 Agentic Error Analysis - LLM Integration
**Tasks:** Phase 3 (5 tasks)
- [ ] 10. Implement agentic LLM analyzer
- [ ] 10.1 Write property tests for LLM analysis
- [ ] 11. Implement prompt persistence
- [ ] 11.1 Write unit tests for prompt persistence
- [ ] 12. Create ACE context manager
- [ ] 12.1 Write property tests for ACE context
- [ ] 13. Implement error analysis pipeline
- [ ] 13.1 Write integration tests for analysis pipeline
- [ ] 14. Checkpoint - Ensure all tests pass

**Why High:** Core agentic reasoning for error fixes.

**Estimated Time:** 12-18 hours

#### 2.3 Agentic Error Analysis - Diff Generation
**Tasks:** Phase 4 (5 tasks)
- [ ] 15. Implement diff generator
- [ ] 15.1 Write property tests for diff generation
- [ ] 16. Implement diff application
- [ ] 16.1 Write unit tests for diff application
- [ ] 17. Implement validation service
- [ ] 17.1 Write property tests for validation
- [ ] 18. Create diff model and storage
- [ ] 18.1 Write unit tests for diff storage
- [ ] 19. Checkpoint - Ensure all tests pass

**Why High:** Automated code fixes for errors.

**Estimated Time:** 10-15 hours

---

### Priority 3: All-Routes Integration (HIGH)
**Goal:** Wire NES Command Center to all-routes page with real data

#### 3.1 NES Command Center - Server-Side Loading
**Tasks:** Phase 6 (8 tasks)
- [ ] 6. Update +page.server.ts to load from database
- [ ] 6.1 Implement database query for route metadata
- [ ] 6.2 Implement route merge logic
- [ ] 6.3 Implement error count enrichment
- [ ] 6.4 Implement health status enrichment
- [ ] 6.5 Implement suggestion count enrichment
- [ ] 6.6 Write property test for server-side enrichment
- [ ] 6.7 Write property test for health status enrichment
- [ ] 6.8 Write unit tests for server-side data loading

**Why High:** Makes all-routes page show real error data from database.

**Estimated Time:** 8-12 hours

#### 3.2 NES Command Center - Interaction Logging
**Tasks:** Phase 7 (5 tasks)
- [ ] 7. Add interaction logging to all-routes page
- [ ] 7.1 Implement logInteraction() helper
- [ ] 7.2 Log route view interactions
- [ ] 7.3 Log route navigate interactions
- [ ] 7.4 Log error brain analyze interactions
- [ ] 7.5 Log patch apply interactions

**Why High:** Tracks user behavior for analytics and debugging.

**Estimated Time:** 4-6 hours

---

### Priority 4: Production Hardening (MEDIUM)
**Goal:** Add feature flags, error handling, and monitoring

#### 4.1 Agentic Error Analysis - Feature Flags
**Tasks:** Phase 5 (5 tasks)
- [ ] 20. Implement feature flag system
- [ ] 20.1 Write property tests for feature flags
- [ ] 21. Implement error-brain middleware
- [ ] 21.1 Write unit tests for middleware
- [ ] 22. Create error-brain API endpoints
- [ ] 22.1 Write integration tests for endpoints
- [ ] 23. Implement audit trail service
- [ ] 23.1 Write property tests for audit trail
- [ ] 24. Checkpoint - Ensure all tests pass

**Why Medium:** Allows gradual rollout and easy rollback.

**Estimated Time:** 8-12 hours

#### 4.2 Agentic Knowledge Integration - Docker & Tools
**Tasks:** Tasks 3-5 (9 tasks)
- [ ] 3. Docker Container Integration (3 sub-tasks)
- [ ] 4. Database Tools Enhancement (6 sub-tasks)
- [ ] 5. Checkpoint - Verify Database Tools

**Why Medium:** Ensures tools work in production Docker environment.

**Estimated Time:** 10-15 hours

#### 4.3 Agentic Knowledge Integration - Error Handling
**Tasks:** Task 6 (4 sub-tasks)
- [ ] 6.1 Create retry strategy utility
- [ ] 6.2 Create circuit breaker utility
- [ ] 6.3 Integrate retry and circuit breaker into tool registry
- [ ] 6.4 Write property tests for error handling

**Why Medium:** Production-grade resilience.

**Estimated Time:** 6-8 hours

---

### Priority 5: Real-Time & Archival (LOW)
**Goal:** Add real-time updates and data archival

#### 5.1 NES Command Center - Real-Time Updates
**Tasks:** Phase 10 (3 tasks)
- [ ] 10. Implement real-time health status updates
- [ ] 10.1 Create SSE fallback to WebSocket endpoint
- [ ] 10.2 Broadcast health changes
- [ ] 10.3 Update UI on health change

**Why Low:** Nice-to-have, not critical for MVP.

**Estimated Time:** 6-8 hours

#### 5.2 NES Command Center - Data Archival
**Tasks:** Phase 11 (4 tasks)
- [ ] 11. Implement data archival background job
- [ ] 11.1 Create archival migration
- [ ] 11.2 Implement archival job
- [ ] 11.3 Schedule archival job
- [ ] 11.4 Implement archive query support

**Why Low:** Can be added post-launch.

**Estimated Time:** 6-8 hours

---

### Priority 6: Testing & Documentation (LOW)
**Goal:** Comprehensive testing and documentation

#### 6.1 NES Command Center - Integration Testing
**Tasks:** Phase 12 (5 tasks)
- [ ] 12. Write end-to-end integration tests
- [ ] 12.1 Test route creation and metadata persistence
- [ ] 12.2 Test error cluster creation and health calculation
- [ ] 12.3 Test error brain analysis persistence
- [ ] 12.4 Test interaction logging
- [ ] 12.5 Test real-time health updates

**Estimated Time:** 8-12 hours

#### 6.2 NES Command Center - Testing & Validation
**Tasks:** Phase 13 (4 tasks)
- [ ] 13. Checkpoint - Ensure all tests pass
- [ ] 13.1 Run unit tests
- [ ] 13.2 Run property-based tests
- [ ] 13.3 Run integration tests
- [ ] 13.4 Performance testing

**Estimated Time:** 4-6 hours

#### 6.3 NES Command Center - Documentation
**Tasks:** Phase 14 (4 tasks)
- [ ] 14. Create API documentation
- [ ] 14.1 Create database documentation
- [ ] 14.2 Create deployment guide
- [ ] 14.3 Create developer guide
- [ ] 14.4 Create troubleshooting guide

**Estimated Time:** 6-8 hours

#### 6.4 Agentic Error Analysis - Documentation
**Tasks:** Phase 7 (6 tasks)
- [ ] 30. Create API documentation
- [ ] 31. Create user documentation
- [ ] 32. Implement monitoring and observability
- [ ] 33. Performance optimization
- [ ] 34. Security hardening
- [ ] 35. Final integration and testing
- [ ] 36. Final Checkpoint - Ensure all tests pass

**Estimated Time:** 10-15 hours

#### 6.5 Agentic Knowledge Integration - CLI & MCP
**Tasks:** Tasks 7-9 (7 sub-tasks)
- [ ] 7. CLI Enhancement (3 sub-tasks)
- [ ] 8. VS Code Tasks Integration (2 sub-tasks)
- [ ] 9. MCP Server Integration (3 sub-tasks)
- [ ] 10. Checkpoint - Verify All Integrations

**Estimated Time:** 8-12 hours

#### 6.6 Agentic Knowledge Integration - Performance & Docs
**Tasks:** Tasks 11-13 (7 sub-tasks)
- [ ] 11. Performance Optimization (3 sub-tasks)
- [ ] 12. Documentation (3 sub-tasks)
- [ ] 13. Final Checkpoint - Production Ready

**Estimated Time:** 8-12 hours

---

## Recommended Execution Order

### Week 1: Foundation (Priority 1)
**Goal:** Get core infrastructure working
- Day 1-2: NES Command Center Phase 1 (database schema)
- Day 3-4: Agentic Knowledge Integration test fixes
- Day 5: Checkpoint and integration testing

**Deliverable:** Database schema deployed, all tests passing

### Week 2: Error Production Help (Priority 2)
**Goal:** Wire up error analysis and automated fixes
- Day 1-2: Agentic Error Analysis Phase 2 (RAG integration)
- Day 3-4: Agentic Error Analysis Phase 3 (LLM integration)
- Day 5: Agentic Error Analysis Phase 4 (diff generation)

**Deliverable:** Error analysis pipeline working end-to-end

### Week 3: All-Routes Integration (Priority 3)
**Goal:** Wire NES Command Center to all-routes page
- Day 1-2: NES Command Center Phase 6 (server-side loading)
- Day 3: NES Command Center Phase 7 (interaction logging)
- Day 4-5: Integration testing and bug fixes

**Deliverable:** All-routes page showing real error data

### Week 4: Production Hardening (Priority 4)
**Goal:** Add feature flags, error handling, monitoring
- Day 1-2: Agentic Error Analysis Phase 5 (feature flags)
- Day 3: Agentic Knowledge Integration Docker & tools
- Day 4-5: Agentic Knowledge Integration error handling

**Deliverable:** Production-ready error handling and feature flags

### Week 5+: Polish (Priorities 5-6)
**Goal:** Real-time updates, archival, testing, documentation
- Real-time updates (optional)
- Data archival (optional)
- Comprehensive testing
- Documentation

**Deliverable:** Fully documented, production-ready system

---

## Total Effort Estimate

| Priority | Tasks | Estimated Hours | Estimated Days |
|----------|-------|-----------------|----------------|
| Priority 1 | 7 | 12-18 | 2-3 |
| Priority 2 | 15 | 32-48 | 5-7 |
| Priority 3 | 13 | 12-18 | 2-3 |
| Priority 4 | 18 | 24-35 | 4-5 |
| Priority 5 | 7 | 12-16 | 2-3 |
| Priority 6 | 33 | 44-65 | 7-10 |
| **TOTAL** | **93** | **136-200** | **22-31** |

**MVP (Priorities 1-3):** 35 tasks, 56-84 hours, 9-13 days
**Production Ready (Priorities 1-4):** 53 tasks, 80-119 hours, 13-18 days
**Fully Complete (All Priorities):** 93 tasks, 136-200 hours, 22-31 days

---

## Success Criteria

### MVP Success (Priorities 1-3)
- [ ] Database schema deployed with all tables
- [ ] All tests passing (0 failures)
- [ ] Error analysis pipeline working
- [ ] All-routes page showing real error data
- [ ] Interaction logging working
- [ ] Basic error fixes automated

### Production Ready (Priorities 1-4)
- [ ] Feature flags implemented
- [ ] Error handling with retries and circuit breakers
- [ ] Docker container integration working
- [ ] Audit trail for all operations
- [ ] Monitoring and observability
- [ ] Security hardening complete

### Fully Complete (All Priorities)
- [ ] Real-time updates via WebSocket/SSE
- [ ] Data archival working
- [ ] Comprehensive test suite (unit, property, integration)
- [ ] Complete documentation (API, database, deployment, troubleshooting)
- [ ] Performance optimized
- [ ] CLI and MCP server enhanced

---

## Risk Mitigation

### High Risk: Test Failures Blocking Development
**Mitigation:** Fix test infrastructure first (Priority 1)
**Fallback:** Skip optional property tests, focus on unit tests

### Medium Risk: Database Schema Changes Breaking Existing Code
**Mitigation:** Use Drizzle migrations, test thoroughly
**Fallback:** Soft delete pattern prevents data loss

### Medium Risk: LLM Integration Complexity
**Mitigation:** Start with simple prompts, iterate
**Fallback:** Use mock LLM for testing

### Low Risk: Real-Time Updates Performance
**Mitigation:** Use SSE fallback, limit broadcast frequency
**Fallback:** Poll-based updates

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize** based on business needs
3. **Start with Priority 1** (Foundation)
4. **Execute in order** following the weekly plan
5. **Checkpoint after each priority** to assess progress

---

## Questions for User

1. **Timeline:** Do you want MVP (2 weeks), Production Ready (3 weeks), or Fully Complete (4-5 weeks)?
2. **Priorities:** Are the priorities correct, or should we adjust?
3. **Resources:** How many developers are available?
4. **Blockers:** Are there any known blockers (infrastructure, access, etc.)?
5. **Testing:** Should we skip optional property tests to move faster?

---

**Status:** Ready for Review
**Last Updated:** December 21, 2025
**Maintained By:** Kiro IDE
