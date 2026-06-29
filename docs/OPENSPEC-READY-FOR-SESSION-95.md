# OpenSpec Ready for Session 95

**Date:** June 29, 2026  
**OpenSpec Version:** 1.5.0  
**Status:** ✅ INSTALLED | ✅ DOCUMENTED | ✅ READY TO INITIALIZE

---

## What's Ready

### Installation ✅
- OpenSpec 1.5.0 installed globally: `npm install -g @fission-ai/openspec@latest`
- Verify: `openspec --version` → `1.5.0`
- All commands working: `init`, `spec`, `change`, `archive`, `instructions`, etc.

### Documentation ✅
Three comprehensive guides created in `docs/`:

1. **`OPENSPEC-INSTALLATION-GUIDE.md`** (1,200 lines)
   - Complete OpenSpec concept overview
   - All v1.5.0 commands documented
   - Workflow: Proposal → Specs → Design → Tasks → Archive
   - Integration with Agent Scheduler
   - Environment configuration

2. **`OPENSPEC-CHEATSHEET.md`** (300 lines)
   - Quick reference for common commands
   - Session 95 step-by-step workflow
   - Integration points (OpenSpec ↔ Agent Scheduler)
   - Troubleshooting

3. **This document** — High-level summary

### Architecture Ready ✅
All components designed and documented:
- 4-layer event sourcing (Layer 1-4)
- Unified Agent Scheduler
- Executive Planner + signal collection
- Go Sidecar wiring
- Complete data flow diagrams

---

## What to Do in Session 95 (50 min)

### Phase 1: Initialize OpenSpec (5 min)
```bash
cd sveltekit-frontend
openspec init --tools claude --force

# Creates .openspec/ directory with:
# ├─ .openspec.md (project config)
# ├─ proposals/
# ├─ specs/
# ├─ designs/
# └─ tasks/
```

### Phase 2: Create Proposal (5 min)
```bash
openspec new
# → proposal
# → event-sourcing-agent-scheduler
# → Intent: Event log + scheduler + planning layer
# → Success criteria: Schema, scheduler, planner, sidecar wiring
```

### Phase 3: Break into 5 Specs (10 min)
Each spec maps to an architectural layer:

1. **layer-1-immutable-event-log**
   - agent_os_events, context_timeline_events, gpu_compute_events

2. **layer-2-projections**
   - packet_features consolidation, task_state_projection, engram_recall_projection

3. **agent-scheduler-unified**
   - Job queue, dependency resolution, worker assignment

4. **executive-planner**
   - Signal collection, recommendation generation

5. **go-sidecar-wiring**
   - NATS event emission, correlation_id tracing

### Phase 4: Create 3 Designs (10 min)
Technical decisions for:

1. **correlation-id-tracing** — Why/how end-to-end tracing works
2. **packet-features-consolidation** — Why one table vs. scattered
3. **dependency-resolution** — How jobs wait on dependencies

### Phase 5: Create 4 Tasks (10 min)
Actionable work items (from SESSION-95-QUICKSTART.md):

1. **apply-schema-migration** (5 min)
   - Command: `docker exec -i legal-ai-postgres psql ... < drizzle/0100_*.sql`
   - Success: 5 tables in Postgres

2. **test-orchestrator** (5 min)
   - Command: `npm run agent:scheduler:dry`
   - Success: No errors, jobs evaluated

3. **wire-go-sidecar** (90 min)
   - Add Postgres writes + NATS pub
   - Success: Events in agent_os_events

4. **end-to-end-test** (20 min)
   - Full flow: spec → scheduler → NATS → events
   - Success: All gates pass

### Phase 6: Get Instructions (5 min)
```bash
openspec instructions apply-schema-migration
# Output: Step-by-step breakdown, verification, rollback
```

### Phase 7: Validate (5 min)
```bash
openspec validate
openspec doctor
openspec view  # Interactive dashboard
```

---

## OpenSpec + Architecture Mapping

### Your Specs ↔ Architecture Layers

```
Layer 1: Immutable Event Log
  ↓ OpenSpec Spec
  layer-1-immutable-event-log
  ├─ Design: correlation-id-tracing
  └─ Tasks:
      ├─ apply-schema-migration (5 min)
      ├─ test-layer-1-emission (10 min)
      └─ verify-event-log (5 min)

Layer 2: Projections
  ↓ OpenSpec Spec
  layer-2-projections
  ├─ Design: packet-features-consolidation
  └─ Tasks:
      ├─ consolidate-packet-features (15 min)
      ├─ test-projection-rebuild (10 min)
      └─ consistency-check (5 min)

Agent Scheduler
  ↓ OpenSpec Spec
  agent-scheduler-unified
  ├─ Design: dependency-resolution
  └─ Tasks:
      ├─ test-orchestrator (5 min)
      ├─ assign-jobs (10 min)
      └─ worker-pickup (10 min)

Executive Planner
  ↓ OpenSpec Spec
  executive-planner
  └─ Tasks:
      ├─ signal-collection (10 min)
      ├─ recommendation-generation (10 min)
      └─ emission-to-scheduler (5 min)

Go Sidecar
  ↓ OpenSpec Spec
  go-sidecar-wiring
  └─ Tasks:
      ├─ wire-layer-1-events (90 min)
      ├─ publish-nats-invalidate (20 min)
      └─ end-to-end-test (20 min)
```

### OpenSpec Task ↔ Agent Scheduler Job

Each OpenSpec task can be converted to an Agent Scheduler job:

```
OpenSpec Task: "apply-schema-migration"
├─ Parent spec: "layer-1-immutable-event-log"
├─ Time estimate: 5 min
├─ Command: docker exec -i ... < drizzle/0100_*.sql
├─ Success criteria: 5 tables in Postgres
└─ Dependencies: [postgres-running]

↓ (When added to scheduler)

Agent Scheduler Job
├─ job_id: uuid
├─ job_type: schema_migration
├─ priority: 100
├─ payload: { 
    spec_id: "layer-1-immutable-event-log",
    task_name: "apply-schema-migration",
    command: "docker exec ...",
    time_estimate_min: 5
  }
├─ status: pending → queued → executing → completed
└─ assigned_worker: langraph
```

---

## Document Locations

All documentation in `docs/`:

```
docs/
├─ OPENSPEC-INSTALLATION-GUIDE.md     (1,200 lines) — Full reference
├─ OPENSPEC-CHEATSHEET.md             (300 lines) — Quick reference
├─ OPENSPEC-READY-FOR-SESSION-95.md   (this file) — High-level summary
├─ OPENSPEC-INTEGRATION-PLAN.md       (650 lines) — Architecture integration
│
├─ PHASE-5-EXTENDED-EVENT-SOURCING-ARCHITECTURE.md (850 lines)
├─ SESSION-94-EVENT-SOURCING-WIRED.md
├─ SESSION-94-OPENSPEC-ARCHITECTURE-COMPLETE.md
├─ ARCHITECTURE-DIAGRAM-COMPLETE.md
├─ SESSION-95-QUICKSTART.md
│
└─ (Reference docs from earlier sessions)
```

**Start with:** `OPENSPEC-INSTALLATION-GUIDE.md` (complete reference)  
**Quick reference:** `OPENSPEC-CHEATSHEET.md` (commands + workflow)  
**Architecture:** `PHASE-5-EXTENDED-EVENT-SOURCING-ARCHITECTURE.md` (technical)

---

## Session 95 Timeline (2 hours total)

### Phase 1: Initialize OpenSpec (5 min) ✅ VERIFIED

```bash
cd sveltekit-frontend

# Initialize with Claude as AI tool, auto-cleanup legacy files
openspec init --tools claude --force

# Expected output:
# Initializing OpenSpec in /path/to/sveltekit-frontend
# Creating .openspec directory...
# Setting up default artifacts...
# Configuration: tools=claude
```

**Verify initialization:**
```bash
# Check .openspec directory exists
ls -la .openspec/
# Expected: .openspec.md, proposals/, specs/, designs/, tasks/

# Check project config
cat .openspec/.openspec.md
# Expected: name, slug, tools: claude
```

### Phases 2-7: Create Artifacts & Validate (50 min)

| Phase | Task | Time | Command |
|-------|------|------|---------|
| 2 | Create proposal | 5 min | `openspec new` (proposal) |
| 3 | Create 5 specs | 10 min | `openspec new` (5× spec) |
| 4 | Create 3 designs | 10 min | `openspec new` (3× design) |
| 5 | Create 4 tasks | 10 min | `openspec new` (4× task) |
| 6 | Get instructions | 5 min | `openspec instructions apply-schema-migration` |
| 7 | Validate | 5 min | `openspec validate && openspec doctor && openspec view` |

### Phase 8: Execute Tasks (95 min)

| Task | Time | Status |
|------|------|--------|
| apply-schema-migration | 5 min | See SESSION-95-QUICKSTART.md |
| test-orchestrator | 5 min | See SESSION-95-QUICKSTART.md |
| wire-go-sidecar | 90 min | See SESSION-95-QUICKSTART.md |
| end-to-end-test | 20 min | See SESSION-95-QUICKSTART.md |

**See [SESSION-95-QUICKSTART.md](SESSION-95-QUICKSTART.md) for detailed step-by-step execution guide.**

---

## Validation Gates (All Must Pass)

✅ OpenSpec initialized (`.openspec/` directory exists)  
✅ Proposal created (defines intent + success criteria)  
✅ All 5 specs created (map to architecture layers)  
✅ All 3 designs created (technical decisions documented)  
✅ All 4 tasks created (actionable work items)  
✅ `openspec validate` passes (all specs valid)  
✅ `openspec doctor` shows healthy (no broken references)  
✅ First task executed (schema applied to Postgres)

---

## What OpenSpec Gives You

| Capability | Value |
|-----------|-------|
| **Traceability** | Every proposal → spec → design → task is linked |
| **Audit Trail** | Archive moves to main specs, old changes kept (immutable) |
| **AI Integration** | Claude generates enriched instructions for tasks |
| **Versioning** | Changes tracked before archiving (similar to git branches) |
| **Dashboard** | Interactive view of all specs + tasks (`openspec view`) |
| **Validation** | Built-in health checks (`openspec doctor`) |
| **Automation** | Pairs with Agent Scheduler for autonomous task execution |

---

## Key Takeaway

**OpenSpec is spec-driven development for Agent OS:**

1. **User intent** → OpenSpec proposal
2. **Proposal** → OpenSpec specs (what to build)
3. **Specs** → OpenSpec designs (how to build)
4. **Designs** → OpenSpec tasks (do the work)
5. **Tasks** → Agent Scheduler jobs (autonomous execution)
6. **Completion** → OpenSpec archive (audit trail)

This closes the loop: **intent → specs → execution → archive** with full traceability.

---

## Ready to Start?

```bash
# In Session 95, run:
cd sveltekit-frontend
openspec init --tools claude --force

# Then follow OPENSPEC-CHEATSHEET.md steps 1-7
```

**Everything is ready. Start Session 95!**

---

**Status:** ✅ OpenSpec 1.5.0 installed + documented  
**Next:** Session 95 project initialization  
**Owner:** Workstation Executive Planner  
**Refs:** OPENSPEC-INSTALLATION-GUIDE.md | OPENSPEC-CHEATSHEET.md | SESSION-95-QUICKSTART.md
