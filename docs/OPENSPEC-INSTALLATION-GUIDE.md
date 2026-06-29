# OpenSpec Installation & Usage Guide

**Date:** June 29, 2026  
**OpenSpec Version:** 1.5.0  
**Status:** ✅ INSTALLED & READY FOR PROJECT INTEGRATION

---

## What is OpenSpec?

OpenSpec (by Fission AI) is an **AI-native system for spec-driven development**. It helps teams:
- Decompose features into specifications
- Track proposals → specs → design → tasks
- Maintain traceable change management
- Validate specifications before implementation

**Not** a SaaS platform—it's a CLI tool that lives in your repo.

---

## Installation (Complete)

```bash
# Already installed globally
npm install -g @fission-ai/openspec@latest

# Verify
openspec --version
# Output: 1.5.0
```

**Global availability:**
```bash
which openspec
# /usr/local/bin/openspec
```

---

## Core Concepts

### Workflow: Proposal → Specs → Design → Tasks

```
1. PROPOSAL
   ├─ Intent (what problem?)
   ├─ Success criteria
   └─ Stakeholders

2. SPECS
   ├─ Specification 1 (feature A)
   ├─ Specification 2 (feature B)
   └─ Specification 3 (infrastructure)

3. DESIGN
   ├─ Architecture decisions
   ├─ Data models
   └─ API contracts

4. TASKS
   ├─ Task 1 (implementation)
   ├─ Task 2 (testing)
   └─ Task 3 (deployment)
```

### Key Artifacts

| Artifact | Purpose | Example |
|----------|---------|---------|
| **Proposal** | Entry point, describes the "why" | "Implement event sourcing for Agent OS" |
| **Spec** | Detailed specification with acceptance criteria | "Event Log Schema & Postgres Migration" |
| **Design** | Technical design decisions | "4-Layer Architecture: Truth → Projections → Cache → Runtime" |
| **Task** | Actionable work items | "Apply schema migration", "Wire Go sidecar" |
| **Change** | Version of work (after completion, archive to main) | Completed → archive to update specs |

---

## Project Initialization

### Initialize in Deeds Web App

```bash
cd sveltekit-frontend

# Initialize OpenSpec (interactive)
openspec init

# OR non-interactive (use Claude)
openspec init --tools claude --force

# This creates:
# .openspec/
# ├─ .openspec.md (project config)
# ├─ proposals/
# ├─ specs/
# ├─ designs/
# └─ tasks/
```

### What Gets Created

```yaml
# .openspec/.openspec.md
---
name: Deeds Web App
slug: deeds-web-app
description: Event sourcing + Agent Scheduler + OpenSpec planning
tools: claude
---
```

---

## OpenSpec Commands (v1.5.0)

### Project Management

```bash
# Initialize project
openspec init [path] [--tools claude] [--force]

# View dashboard (interactive)
openspec view

# Show current status
openspec status

# Health check
openspec doctor

# Get working context
openspec context
```

### Specification Management

```bash
# List all specs
openspec spec list

# Show a spec
openspec spec show <spec-id>

# Validate a spec
openspec spec validate <spec-id>

# View spec structure
openspec show <spec-id>
```

### Change Management

```bash
# Create a change proposal
openspec change [options]

# Archive completed change
openspec archive <change-name>

# List changes
openspec list [--specs to show specs]

# Show a change
openspec show <change-name>
```

### Task Management

```bash
# Get enriched instructions for a task
openspec instructions [artifact]

# List tasks
openspec list

# Validate changes
openspec validate [item-name]
```

### Configuration

```bash
# Show config location
openspec config path

# List all settings
openspec config list

# Get a value
openspec config get <key>

# Set a value
openspec config set <key> <value>

# Edit config in $EDITOR
openspec config edit

# Reset to defaults
openspec config reset

# Configure workflow profile
openspec config profile
```

### Advanced

```bash
# Create new items
openspec new

# Create custom store (standalone repo)
openspec store

# Manage worksets (local working views)
openspec workset

# Show templates for artifacts
openspec templates

# List schemas
openspec schemas

# Setup shell completion
openspec completion
```

---

## Workflow: How to Use OpenSpec in Your Project

### Phase 1: Define Proposal

```bash
# In .openspec/proposals/ or via CLI:
openspec new
# → Choose "proposal"
# → Name: "event-sourcing-architecture"
# → Fill in intent + success criteria

# Example proposal content:
# ---
# name: Event Sourcing + Agent Scheduler Architecture
# slug: event-sourcing-agent-scheduler
# intent: |
#   Replace memory-registry thinking with immutable event log.
#   Consolidate GPU features into packet_features table.
#   Unify orchestration via Agent Scheduler.
# success_criteria:
#   - Schema applied to Postgres (5 tables live)
#   - Agent Scheduler orchestrates 6 job types
#   - Executive Planner generates recommendations
#   - Go Sidecar emits Layer 1 events
#   - End-to-end: spec → scheduler → NATS → Postgres
# ---
```

### Phase 2: Break into Specs

```bash
openspec new
# → Choose "spec"
# → Parent: "event-sourcing-agent-scheduler"
# → Name: "layer-1-immutable-event-log"

# Creates spec with:
# - Acceptance criteria
# - Verification gates
# - Dependencies
# - Implementation notes
```

**Example specs:**
1. `layer-1-immutable-event-log` — agent_os_events table design
2. `layer-2-projections` — packet_features consolidation
3. `agent-scheduler-unified` — job queue implementation
4. `executive-planner` — recommendation engine
5. `go-sidecar-wiring` — NATS event emission

### Phase 3: Design Decisions

```bash
openspec new
# → Choose "design"
# → Parent spec: "layer-1-immutable-event-log"
# → Name: "correlation-id-tracing"

# Design captures:
# - Why correlation_id?
# - How does it trace end-to-end?
# - What's the format?
# - How do workers use it?
```

### Phase 4: Create Tasks

```bash
openspec new
# → Choose "task"
# → Parent spec: "layer-1-immutable-event-log"
# → Name: "apply-schema-migration"

# Task includes:
# - Command: docker exec ... < drizzle/0100_*.sql
# - Success criteria: 5 tables in Postgres
# - Estimated time: 5 minutes
# - Dependencies: Postgres running
```

### Phase 5: Enrich Tasks with Instructions

```bash
# Get detailed instructions for implementing a task
openspec instructions apply-schema-migration

# Output includes:
# - Step-by-step breakdown
# - Verification commands
# - Rollback procedures
# - Expected outcomes
```

### Phase 6: Archive Completed Work

```bash
# When a change is done:
openspec archive layer-1-immutable-event-log

# This:
# 1. Marks change as complete
# 2. Updates main specs with learnings
# 3. Archives old change for audit trail
# 4. Moves to next proposal/spec cycle
```

---

## Integration with Agent Scheduler

### OpenSpec → Agent Scheduler Flow

```
OpenSpec Spec
  └─ task: "apply-schema-migration"
       ├─ Estimated time: 5 min
       ├─ Priority: critical
       └─ Dependencies: []

Agent Scheduler Job
  ├─ job_type: schema_migration
  ├─ priority: 100
  ├─ payload: { spec_id: "...", task_id: "..." }
  └─ status: pending

Worker
  ├─ Reads: agent_scheduler_jobs (queued)
  ├─ Gets: openspec instructions <task-id>
  ├─ Executes: docker exec ...
  └─ Updates: agent_scheduler_jobs (completed)
```

---

## Your Project Structure (Post-Init)

```
sveltekit-frontend/
├─ .openspec/
│  ├─ .openspec.md (project metadata)
│  ├─ proposals/
│  │  └─ event-sourcing-agent-scheduler.md
│  ├─ specs/
│  │  ├─ layer-1-immutable-event-log.md
│  │  ├─ layer-2-projections.md
│  │  ├─ agent-scheduler-unified.md
│  │  ├─ executive-planner.md
│  │  └─ go-sidecar-wiring.md
│  ├─ designs/
│  │  ├─ correlation-id-tracing.md
│  │  ├─ packet-features-consolidation.md
│  │  └─ agent-scheduler-dependency-resolution.md
│  └─ tasks/
│     ├─ apply-schema-migration.md
│     ├─ test-orchestrator.md
│     ├─ wire-go-sidecar.md
│     └─ end-to-end-test.md
│
├─ drizzle/0100_event_sourcing_packet_features.sql
├─ scripts/agent/agent-scheduler-orchestrator.mjs
├─ scripts/executive/executive-planner.mjs
└─ docs/
   ├─ OPENSPEC-INSTALLATION-GUIDE.md (this file)
   ├─ SESSION-95-QUICKSTART.md
   └─ ...
```

---

## Environment Configuration

### Global OpenSpec Config

```bash
# Location
openspec config path
# ~/.openspec/config.json

# Disable telemetry
export OPENSPEC_TELEMETRY=0

# Set default editor
export EDITOR=vim  # or nano, code, etc.
```

### Project-Specific Config

```bash
# Edit project config
cd sveltekit-frontend
openspec config edit

# Or set values
openspec config set ai-tool claude
openspec config set use-cache true
```

---

## AI Tool Integration

OpenSpec supports multiple AI tools:

```bash
openspec init --tools claude  # Just Claude
openspec init --tools all     # All available
openspec init --tools claude,cursor  # Multiple

# List supported tools:
# amazon-q, antigravity, auggie, bob, claude, cline, codex, 
# forgecode, codebuddy, continue, costrict, crush, cursor, 
# factory, gemini, github-copilot, iflow, junie, kilocode, 
# kimi, kiro, lingma, vibe, opencode, pi, qoder, qwen, roocode, trae, windsurf
```

**For this project:** Use `claude` (already configured in OPENSPEC-INTEGRATION-PLAN.md)

---

## Validation & Quality Gates

### Validate Specs

```bash
# Validate a single spec
openspec spec validate layer-1-immutable-event-log

# Validate all specs
openspec validate

# Check relationships
openspec doctor

# Check completion status
openspec status
```

### Expected Gates

```bash
✅ Proposal has clear intent
✅ All specs reference proposal
✅ All tasks reference specs
✅ All designs have backing specs
✅ Dependencies are resolvable
✅ No circular dependencies
✅ All artifacts have success criteria
✅ All tasks have time estimates
```

---

## Telemetry & Privacy

```bash
# OpenSpec collects anonymous usage stats by default
# Opt out (recommended for corporate environments):
export OPENSPEC_TELEMETRY=0

# Add to ~/.bashrc or ~/.zshrc for persistent opt-out
echo 'export OPENSPEC_TELEMETRY=0' >> ~/.bashrc
```

---

## Next Steps (Session 95)

### Quick Start

1. **Initialize in project** (2 min)
   ```bash
   cd sveltekit-frontend
   openspec init --tools claude --force
   ```

2. **Create proposal** (5 min)
   ```bash
   openspec new
   # → proposal
   # → "event-sourcing-agent-scheduler"
   ```

3. **Break into specs** (10 min)
   ```bash
   openspec new  # 5 specs:
   # layer-1-immutable-event-log
   # layer-2-projections
   # agent-scheduler-unified
   # executive-planner
   # go-sidecar-wiring
   ```

4. **Create tasks** (15 min)
   ```bash
   openspec new  # For each spec:
   # apply-schema-migration
   # test-orchestrator
   # wire-go-sidecar
   # end-to-end-test
   ```

5. **Get instructions** (5 min)
   ```bash
   openspec instructions apply-schema-migration
   # Get step-by-step for first task
   ```

6. **Archive on completion**
   ```bash
   openspec archive event-sourcing-agent-scheduler
   ```

---

## Reference

**Official OpenSpec Docs:**
- GitHub: https://github.com/fission-ai/openspec
- Package: @fission-ai/openspec
- Current version: 1.5.0

**Workflow:**
- Proposal (why) → Specs (what) → Design (how) → Tasks (do) → Archive (done)

**Integration with Deeds Web App:**
- OpenSpec specs ↔ OPENSPEC-INTEGRATION-PLAN.md architecture
- OpenSpec tasks ↔ Agent Scheduler jobs
- OpenSpec instructions ↔ Executive Planner recommendations

---

**Status:** ✅ OpenSpec 1.5.0 installed, ready for project initialization  
**Next:** `openspec init --tools claude --force` in Session 95
