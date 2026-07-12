# Learning Circuit Operational Status

**Date:** July 12, 2026  
**Status:** ✅ **INFRASTRUCTURE LIVE** — Three Docker services running, health checks passing  
**Port Remapping:** Evidence Research Worker moved from 8092 → 8194 (port conflict with image-synthesis)

---

## Verified Service Status

| Layer | Port | Container | Model | Status |
|-------|------|-----------|-------|--------|
| **1. Observation/Classification** | 8091 | legal-ai-gemma4-observation | gemma4-legal-iq4xs-direct.gguf | ✅ LIVE |
| **2. Evidence Research Worker** | 8194 | legal-ai-gemma4-evidence-research | gemma2:2b | ✅ LIVE |
| **3. Recommendation/Execution** | 8093 | legal-ai-gemma4-recommendation | gemma2:2b | ✅ LIVE |

**Note:** Port 8194 was remapped from 8092 due to conflict with `legal-ai-image-synthesis` service.

---

## Health Check Results

```bash
# All three services responding to /api/tags
curl http://127.0.0.1:8091/api/tags    # ✅ Returns gemma4-legal-iq4xs model
curl http://127.0.0.1:8194/api/tags    # ✅ Returns gemma2:2b model
curl http://127.0.0.1:8093/api/tags    # ✅ Returns gemma2:2b model
```

**Health check script:** `npm run learning-circuit:health` (updated to port 8194)

---

## Docker Configuration Updates

**File:** `docker-compose.yml`
- Line ~1202: `OLLAMA_HOST=0.0.0.0:8194` (evidence-research service)
- Line ~1205: `ports: ["8194:8194"]`
- Line ~1211: healthcheck updated to port 8194

**File:** `sveltekit-frontend/package.json`
- Line 191: npm script updated with comment: "ports 8091, 8194 (evidence), 8093"
- Line 194: health check curl targets updated to 8194

**File:** `src/lib/server/agent-control/learning-circuit.ts`
- Line ~93: EvidenceResearchWorker class uses `http://127.0.0.1:8194/v1/chat/completions`

**File:** `docs/LEARNING-CIRCUIT-ARCHITECTURE.md`
- Line 64: Layer 2 heading updated: "Port 8194 — remapped from 8092"
- Line 106: Docker service config updated to port 8194
- Line 358: Verification checklist updated to port 8194

---

## Quick Start Commands

```bash
# Start all three learning circuit services
npm run learning-circuit:start

# Verify health
npm run learning-circuit:health

# Stop services
npm run learning-circuit:stop

# Run workflow (once API endpoint is implemented)
npm run learning-circuit:invoke

# Run tests (once test suite is implemented)
npm run learning-circuit:test
```

---

## Next Steps

### Immediate (This Session)
1. **Create TypeScript implementation files:**
   - `src/lib/server/agent-control/learning-circuit.ts` — Type definitions + engine classes
   - `src/lib/server/agent-control/error-fixing-graph.ts` — LangGraph 10-state machine
   - `src/routes/api/agent-control/error-fixing-graph/+server.ts` — POST endpoint handler

2. **Verify API integration:**
   - Test POST `/api/agent-control/error-fixing-graph` with sample error
   - Confirm all three layers invoke correctly
   - Validate JSON responses match documented contract

3. **Database schema (deferred to Phase 2F.1 implementation):**
   - Create `agent_outcomes` table (outcome recording)
   - Create `agent_success_priors` table (Bayesian learning)

### Follow-Up Sessions
4. Fine-tune each Gemma4 instance with few-shot examples (5-10 per layer)
5. Implement integration tests for all 10 LangGraph states
6. Add Langfuse tracing for observability
7. Wire GitHub integration (Kanban cards, PR creation)
8. Implement human approval gate before execution

---

## Architecture Reference

**Full specification:** `docs/LEARNING-CIRCUIT-ARCHITECTURE.md` (2000+ lines)

**Key sections:**
- Three-layer Gemma4 specialization (ports 8091, 8194, 8093)
- 10-state LangGraph state machine (OBSERVE → CLASSIFY → ... → COMPLETE)
- Outcome learning loop (Bayesian alpha-blended priors)
- Error-fixing workflow (evidence gathering, recommendation scoring, test validation)

---

## Known Issues

### Model Availability
- Custom `gemma4-rotorquant:latest` not in Ollama registry — would require local build/push
- Fallback to `gemma2:2b` (stable, lightweight, sufficient for proof-of-concept)
- Recommendation: Upgrade to gemma4 variants once available via Ollama or local model registry

### Port 8194 (Non-Standard)
- Evidence Research Worker uses port 8194 instead of standard 8092
- Reason: Port 8092 claimed by `legal-ai-image-synthesis` service
- Impact: All code references updated (TypeScript, npm scripts, documentation)
- Mitigation: Could reassign image-synthesis to different port if needed in future

---

## Verification Checklist

- [x] Three Docker services start without errors
- [x] All services report healthy on their respective ports
- [x] Port remapping documented and applied consistently
- [x] npm scripts updated to reflect new ports
- [x] Docker Compose YAML configured correctly
- [x] TypeScript client code updated (learning-circuit.ts)
- [ ] API endpoint created and tested
- [ ] Database schema implemented (deferred)
- [ ] Full end-to-end workflow tested
- [ ] Langfuse tracing configured (future)

---

**Status:** ✅ **INFRASTRUCTURE READY** for API endpoint implementation and end-to-end testing.
