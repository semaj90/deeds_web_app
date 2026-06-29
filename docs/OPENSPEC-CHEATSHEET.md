# OpenSpec Quick Reference Card

**Version:** 1.5.0  
**For:** Deeds Web App Event Sourcing + Agent Scheduler Implementation

---

## One-Liner Commands

```bash
# Initialize project with Claude AI
openspec init --tools claude --force

# View interactive dashboard
openspec view

# List all specs
openspec spec list

# Show a spec
openspec spec show <spec-id>

# Validate all specs
openspec validate

# Check health
openspec doctor

# Create new artifact
openspec new

# Get instructions for a task
openspec instructions <task-name>

# Archive completed work
openspec archive <proposal-name>

# Show config
openspec config list

# Set telemetry opt-out
openspec config set telemetry false
```

---

## Workflow Loop (Session 95)

### Step 1: Initialize (2 min)
```bash
cd sveltekit-frontend
openspec init --tools claude --force
ls -la .openspec/
```

### Step 2: Create Proposal (5 min)
```bash
openspec new
# → proposal
# → Name: event-sourcing-agent-scheduler
# → Intent: Replace memory-registry with immutable event log
# → Success criteria:
#     - Schema applied (5 tables in Postgres)
#     - Agent Scheduler orchestrates jobs
#     - Executive Planner generates recommendations
#     - Go Sidecar emits Layer 1 events
#     - End-to-end flow works
```

### Step 3: Create Specs (10 min)
```bash
openspec new  # 5 times:

# Spec 1
# → spec
# → Parent: event-sourcing-agent-scheduler
# → Name: layer-1-immutable-event-log
# → Acceptance criteria:
#     - agent_os_events table created
#     - context_timeline_events table created
#     - gpu_compute_events table created
#     - All indexes created
#     - Drizzle migration applied

# Spec 2
# → spec → layer-2-projections
# → Acceptance criteria:
#     - packet_features table consolidates all GPU features
#     - Projection rebuild logic works
#     - Consistency check detects divergence

# Spec 3
# → spec → agent-scheduler-unified
# → Acceptance criteria:
#     - 6 job types queued
#     - Dependency resolution works
#     - Workers assigned correctly

# Spec 4
# → spec → executive-planner
# → Acceptance criteria:
#     - Collects 7 signals
#     - Generates recommendations
#     - Emits to Agent Scheduler

# Spec 5
# → spec → go-sidecar-wiring
# → Acceptance criteria:
#     - Emits Layer 1 events on NATS
#     - Publishes bifrost.invalidate on Postgres write
#     - Traces end-to-end via correlation_id
```

### Step 4: Create Designs (10 min)
```bash
openspec new  # 3 times:

# Design 1: Correlation ID Tracing
# → design
# → Parent: layer-1-immutable-event-log
# → Name: correlation-id-tracing
# → Content: Why/how correlation_id traces end-to-end

# Design 2: Packet Features Consolidation
# → design
# → Parent: layer-2-projections
# → Name: packet-features-consolidation
# → Content: Why one table vs. scattered features

# Design 3: Agent Scheduler Dependency Resolution
# → design
# → Parent: agent-scheduler-unified
# → Name: dependency-resolution
# → Content: How jobs wait on dependencies
```

### Step 5: Create Tasks (15 min)
```bash
openspec new  # 4 times:

# Task 1: Apply Schema
# → task
# → Parent: layer-1-immutable-event-log
# → Name: apply-schema-migration
# → Command: docker exec -i legal-ai-postgres psql ... < drizzle/0100_*.sql
# → Success: 5 tables exist
# → Time: 5 min

# Task 2: Test Orchestrator
# → task
# → Parent: agent-scheduler-unified
# → Name: test-orchestrator
# → Command: npm run agent:scheduler:dry
# → Success: No errors, jobs evaluated
# → Time: 5 min

# Task 3: Wire Go Sidecar
# → task
# → Parent: go-sidecar-wiring
# → Name: wire-go-sidecar
# → Command: Edit main.go, add Layer 1 event emission
# → Success: Events in agent_os_events
# → Time: 90 min

# Task 4: End-to-End Test
# → task
# → Parent: executive-planner
# → Name: end-to-end-test
# → Command: Run full flow spec → scheduler → NATS → events
# → Success: All gates pass
# → Time: 20 min
```

### Step 6: Get Instructions
```bash
# For first task
openspec instructions apply-schema-migration

# Output includes:
# - Step-by-step breakdown
# - Verification commands
# - Expected outcomes
# - Rollback procedures
```

### Step 7: Execute & Validate
```bash
# Validate all specs
openspec validate

# Check health
openspec doctor

# View dashboard
openspec view

# Show status
openspec status
```

### Step 8: Archive on Completion
```bash
# When all tasks done
openspec archive event-sourcing-agent-scheduler

# This:
# - Marks as complete
# - Updates main specs
# - Saves to archive (audit trail)
# - Ready for next cycle
```

---

## File Locations

```bash
# Config
~/.openspec/config.json           # Global config
sveltekit-frontend/.openspec.md   # Project config

# Artifacts
.openspec/proposals/              # Feature/initiative proposals
.openspec/specs/                  # Detailed specifications
.openspec/designs/                # Architecture decisions
.openspec/tasks/                  # Actionable work items
.openspec/changes/                # Work in progress (before archive)
```

---

## Integration Points

### OpenSpec ↔ Agent Scheduler

```
OpenSpec Task
├─ Name: "apply-schema-migration"
├─ Time: 5 min
├─ Dependencies: [postgres-running]
└─ Instructions: { command: "docker exec...", verify: "5 tables" }

↓ (converted to)

Agent Scheduler Job
├─ job_id: uuid
├─ job_type: schema_migration
├─ priority: 100
├─ payload: { spec_id: "...", task_name: "..." }
└─ status: pending
```

### OpenSpec ↔ Executive Planner

```
Executive Planner Recommendation
├─ Title: "GPU refresh stale packets"
├─ Priority: 0.90
├─ Confidence: 0.92
└─ Suggested tools: [gpu_compute_events, packet_features]

↓ (created from)

OpenSpec Spec: "layer-2-projections"
├─ Acceptance criteria: [packet_features stale < 7d]
├─ Verification gates: [consistency_check]
└─ Tasks: [gpu_refresh, packet_features_rebuild]
```

---

## Telemetry (Privacy)

```bash
# Opt out of anonymous telemetry
export OPENSPEC_TELEMETRY=0

# Or set in config
openspec config set telemetry false

# Add to ~/.bashrc for persistence
echo 'export OPENSPEC_TELEMETRY=0' >> ~/.bashrc
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `openspec: command not found` | `npm install -g @fission-ai/openspec@latest` |
| `Error: no editor configured` | `export EDITOR=vim` or `openspec config edit` |
| `Warning: No .openspec.md found` | `cd project && openspec init --force` |
| `Cannot read spec` | `openspec validate` to check health |
| `Port conflict` | OpenSpec uses local filesystem only, no ports |

---

## Key Concepts

| Term | Meaning |
|------|---------|
| **Proposal** | High-level "why" (feature/initiative) |
| **Spec** | Detailed specification with acceptance criteria |
| **Design** | Technical architecture decisions |
| **Task** | Actionable work item (time estimate, command) |
| **Change** | In-progress work (before archiving) |
| **Archive** | Completed proposal moved to main specs (audit trail) |

---

## Next Session Checklist

- [ ] Run `openspec init --tools claude --force`
- [ ] Create proposal "event-sourcing-agent-scheduler"
- [ ] Create 5 specs (Layer 1, Layer 2, Scheduler, Planner, Sidecar)
- [ ] Create 3 designs (Tracing, Consolidation, Dependencies)
- [ ] Create 4 tasks (Schema, Orchestrator, Sidecar, E2E)
- [ ] Validate: `openspec validate`
- [ ] Get instructions: `openspec instructions apply-schema-migration`
- [ ] Execute first task (apply schema)
- [ ] Archive on completion

---

**Status:** OpenSpec 1.5.0 installed, ready for project setup  
**Next:** Session 95 `openspec init`
