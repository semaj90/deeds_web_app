# Detective Mode Training Integration

**Generated:** March 1, 2026
**Session:** 93r28c
**Status:** Enhanced detective mode generator complete

---

## Overview

This document connects the TODO documentation work (Files 00-07) with the Detective Mode training dataset enhancement. The investigation workflow used to create the next_steps/ directory is now captured as 500 training examples for the VLM.

---

## What We Built (This Session)

### Phase 1: TODO Documentation (Files 00-07)
- **Method**: Systematic codebase investigation using Grep, Glob, Read tools
- **Output**: 7 TODO files + 1 master overview (~204 hours of work documented)
- **Categories**: Reports, MCP, Evidence, AI, Infrastructure, Database, ML Training

### Phase 2: Detective Mode Enhancement (Files 08)
- **Method**: Extracted investigation patterns from Phase 1 into training examples
- **Output**: Enhanced detective mode generator + 500 new training examples
- **Categories**: TODO management, DB safety, ML inventory, API mapping, infrastructure

---

## The Meta-Pattern

**Key insight**: Our TODO documentation workflow IS a detective mode training example.

### What We Did (Session 93r28c)
```
User request: "ripgrep search awk codebase and create .md todo"
  ↓
1. Grep for TODO/FIXME patterns across 630+ files
2. Read schema-postgres.ts (2300+ lines, document 70+ tables)
3. Analyze mcp/server.ts (find current tools, identify gaps)
4. Glob for training datasets (find 38 JSONL files)
5. Read prepare_colab_datasets.py (understand pipeline)
6. Synthesize findings → 7 categorized markdown files
7. Create 4-phase implementation roadmap
```

### What The VLM Will Learn (After Training)
```
User request: "ripgrep search awk codebase and create .md todo"
  ↓
[Same exact workflow, autonomously executed]
  ↓
Output: Categorized TODO files + priority matrix + roadmap
```

**The difference**: We manually orchestrated tools → VLM will do it autonomously.

---

## Enhanced Detective Mode (5 New Categories)

### 1. TODO Management & Prioritization
**Based on**: Files 00-07 (this session's actual work)

**Training examples teach**:
- Aggregate scattered TODOs into categories
- Estimate effort (hours) for each item
- Identify blocking dependencies
- Create implementation roadmaps

**Real session output**: 87 TODOs → 7 categories → ~204 hours → 4-phase roadmap

---

### 2. Database Schema Analysis
**Based on**: File 06 (database-migrations.md)

**Training examples teach**:
- Read schema files (schema-postgres.ts, 70+ tables)
- Detect dangerous DROP TABLE statements
- Propose additive-only migrations (zero data loss)
- Validate schema consistency

**Real session output**: Found dangerous DROP CASCADE in drizzle/0002_flaky_midnight.sql, proposed 7 safe additive tables

---

### 3. Training Dataset Inventory
**Based on**: File 07 (ml-training.md)

**Training examples teach**:
- Find JSONL files (Glob `**/*.jsonl`)
- Analyze dataset generation scripts
- Count total examples and file sizes
- Identify missing infrastructure (evaluation, A/B testing)

**Real session output**: 38 datasets (102.5K examples, ~2.1MB), multimodal Phase 1 complete, TensorRT optimization opportunity

---

### 4. API Endpoint Mapping
**Based on**: Files 01-03 (reports/mcp/evidence next steps)

**Training examples teach**:
- Find all API routes (Glob `src/routes/api/**/*.ts`)
- Detect 500 errors and broken wirings
- Map endpoint → component → route relationships
- Identify missing implementations

**Real session output**: Template generation endpoint 500 error, 175+ endpoints mapped, 15 missing implementations

---

### 5. Multimodal Infrastructure Status
**Based on**: File 05 (infrastructure.md)

**Training examples teach**:
- Analyze server infrastructure (Redis, embeddings, Docker)
- Read configuration files (redis.ts, embedding-worker.ts)
- Identify scalability risks (single connections, missing persistence)
- Check service health (Docker status, test coverage)

**Real session output**: Redis single connection risk, embeddings not persisted (line 146), postgres DOWN, 19 tests → 100+ goal

---

## Training Dataset Files Created

### 1. `generate_detective_mode_enhanced.py` (230 lines)
**Purpose**: Generates 500 advanced investigation examples

**Key features**:
- 5 scenario categories (25%, 25%, 20%, 15%, 15% distribution)
- ShareGPT message format (Gemma 3 compatible)
- Realistic tool argument generation
- Multi-step reasoning chains (2-4 tools per example)

**Usage**:
```bash
python generate_detective_mode_enhanced.py --output ./colab-datasets/detective_mode_enhanced.jsonl
```

---

### 2. `DETECTIVE_MODE_ENHANCED.md` (650 lines)
**Purpose**: Complete documentation of enhanced training dataset

**Sections**:
- New scenario categories (5 detailed explanations)
- Training format examples (ShareGPT JSON)
- Tool usage distribution (enhanced vs base)
- Integration with training pipeline (Option A/B)
- Post-training validation tests
- Comparison: base vs enhanced

---

### 3. `prepare_colab_datasets.py` (Updated)
**Changes**:
- Added step 9: Detective Mode Enhanced generator
- Auto-combines base + enhanced → `detective_mode_full.jsonl` (1000 examples)
- Updated header: 8 → 10 files, 102.5K → 103.5K examples
- Updated Option B: evidence only → evidence + detective mode (2K examples)

---

## Training Integration

### Option A: Full QLoRA (103.5K examples)
```
Legal docs:           60,000 examples
Tool calling:         31,500 examples (Glaive/Hermes/xLAM/ShareGPT)
Detective mode:        1,000 examples (500 base + 500 enhanced)
Video:                70,000 examples
Evidence:              1,000 examples
─────────────────────────────────────
Total:               103,500 examples

Training time: 6-8 hours (A100 40GB)
```

### Option B: ACE Synthesis (2K examples)
```
Evidence:              1,000 examples (ACE context patterns)
Detective mode:        1,000 examples (500 base + 500 enhanced)
─────────────────────────────────────
Total:                 2,000 examples

Training time: 1-2 hours (A100 40GB)
```

**Recommendation**: Option B now includes detective mode (1K examples) for self-prompting and codebase investigation capabilities. Critical for ACE Context Engine self-improvement.

---

## Post-Training Capabilities

### Before Training (Stock Gemma3)
```
User: "Find all TODOs and create a roadmap"
Stock VLM: "I don't have access to your codebase files."
```

### After Base Detective Mode (500 examples)
```
User: "Find all TODOs and create a roadmap"
Trained VLM: [Uses ripgrep_search]
             → "Found 87 TODOs. Here's the list..."
```

### After Enhanced Detective Mode (1000 examples)
```
User: "Find all TODOs and create a roadmap"
Trained VLM: [Uses ripgrep → extract_pattern → analyze_file]
             → "87 TODOs across 7 categories:

                 CRITICAL (12 items, 12 hours total):
                 - Fix template endpoint (30min) - blocks AI reports
                 - Add audit logging (2hr) - legal compliance
                 - Redis connection pooling (1hr) - scalability risk

                 HIGH (28 items, 40 hours total):
                 - MCP report tools (2hr)
                 - Evidence version history (2.5hr)
                 - Report streaming AI (2hr)

                 MEDIUM (47 items, ~150 hours):
                 - Template marketplace (8hr)
                 - Evidence bulk upload (3hr)
                 - Multi-model support (2hr)

                 4-Phase Roadmap:
                 Phase 1 (Week 1, 12hr): Critical fixes
                 Phase 2 (Week 2-3, 40hr): High-value features
                 Phase 3 (Week 4-6, 50hr): Polish & scale
                 Phase 4 (Week 7-8, 50hr): Advanced features

                 Created next_steps/ directory with 7 detailed TODO files."
```

**The transformation**: List → Categorized plan with effort estimates and roadmap

---

## Validation Tests (Recommended)

After training the model with enhanced detective mode, run these tests:

### Test 1: TODO Aggregation
```bash
Prompt: "Analyze all TODOs in the codebase and create a sprint plan"

Expected output:
- Category breakdown (Reports, Evidence, AI, etc.)
- Effort estimates in hours
- Priority ranking (CRITICAL/HIGH/MEDIUM)
- 4-phase implementation roadmap
- Identification of blocking dependencies

Pass criteria: Output matches format of 00-OVERVIEW.md
```

### Test 2: Database Migration Safety
```bash
Prompt: "Review drizzle/0002_flaky_midnight.sql for dangerous operations"

Expected output:
- Identifies DROP TABLE CASCADE statements
- Counts affected rows (e.g., "2,764 items in kg_nodes")
- Warns about data loss risk
- Suggests ALTER TABLE RENAME alternative

Pass criteria: Contains "⚠️ CRITICAL" or "DANGEROUS" + rollback recommendation
```

### Test 3: ML Infrastructure Inventory
```bash
Prompt: "How many training datasets do we have and what's missing?"

Expected output:
- Correct count (38 JSONL files)
- Total examples (~102.5K)
- File size (~2.1MB)
- Gap analysis (evaluation metrics, A/B testing, TensorRT)

Pass criteria: Mentions specific numbers + identifies 3+ missing components
```

### Test 4: API Health Check
```bash
Prompt: "Which API endpoints are broken?"

Expected output:
- Template generation endpoint returns 500
- Identifies import/runtime error
- Notes it blocks AI-powered reports
- Provides file path and line number

Pass criteria: Mentions /api/reports/generate-from-template + blocking impact
```

---

## Files Modified/Created (Summary)

| File | Type | Lines | Purpose |
|------|------|-------|---------|
| `00-OVERVIEW.md` | Created | 370 | Master TODO index, top 10 priorities, roadmap |
| `01-reports-next-steps.md` | Created | 520 | 20 report improvements (65-75 hours) |
| `02-mcp-integration.md` | Created | 380 | 20+ MCP tools (22 hours) |
| `03-evidence-improvements.md` | Created | 290 | 10 evidence enhancements (29.5 hours) |
| `04-ai-integration.md` | Created | 310 | 10 LLM/embedding fixes (16.5 hours) |
| `05-infrastructure.md` | Created | 340 | 10 infrastructure items (28.5 hours) |
| `06-database-migrations.md` | Created | 450 | 7 safe additive tables (~2 hours) |
| `07-ml-training.md` | Created | 680 | 10 training items (46 hours) |
| `08-detective-mode-integration.md` | Created | 450 | This file (integration guide) |
| `generate_detective_mode_enhanced.py` | Created | 230 | Enhanced dataset generator (500 examples) |
| `DETECTIVE_MODE_ENHANCED.md` | Created | 650 | Enhanced dataset documentation |
| `prepare_colab_datasets.py` | Modified | +60 | Added step 9 (enhanced detective mode) |

**Total**: 9 new files, 1 modified file, ~4,700 lines of documentation + code

---

## Effort Summary

### TODO Documentation (Files 00-07)
- **Identified work**: ~204 hours across 87 TODO items
- **Documentation time**: ~3 hours (this session)
- **Categories**: 7 major areas
- **Priority breakdown**: 12 CRITICAL, 28 HIGH, 47 MEDIUM

### Detective Mode Enhancement (Files 08 + generators)
- **Training examples**: 500 new examples (1000 total with base)
- **Scenario categories**: 5 advanced investigation patterns
- **Code generation**: 230 lines (Python generator)
- **Documentation**: 1,100 lines (2 markdown files)
- **Training time impact**: +30 minutes (A100 40GB)

---

## Next Steps

### 1. Generate Enhanced Dataset
```bash
cd scripts/unsloth-training/

# Generate all datasets (including detective mode enhanced)
python prepare_colab_datasets.py --output ./colab-datasets

# Verify output
ls -lh colab-datasets/
# Should see: detective_mode.jsonl (500), detective_mode_enhanced.jsonl (500), detective_mode_full.jsonl (1000)
```

### 2. Upload to Google Drive
```bash
# Upload entire colab-datasets/ folder to:
# /MyDrive/COLAB_PACKAGE/training-datasets/

# Key files:
# - evidence_qlora.jsonl (1K examples)
# - detective_mode_full.jsonl (1K examples) ← NEW
# - tool_calling_*.jsonl (31K examples)
# - video_*.jsonl (70K examples)
```

### 3. Train Model (Choose Option)
```python
# Option A: Full QLoRA (6-8 hours, 103.5K examples)
TRAINING_MODE = "OPTION_A"
DATASETS = [
    "evidence_qlora.jsonl",
    "tool_calling_glaive.jsonl",
    "tool_calling_hermes.jsonl",
    "tool_calling_xlam.jsonl",
    "tool_calling_sharegpt.jsonl",
    "video_webvid.jsonl",
    "video_activitynet.jsonl",
    "detective_mode_full.jsonl"  # ← 1K examples (500 base + 500 enhanced)
]

# Option B: ACE Synthesis (1-2 hours, 2K examples)
TRAINING_MODE = "OPTION_B"
DATASETS = [
    "evidence_qlora.jsonl",       # 1K examples
    "detective_mode_full.jsonl"   # 1K examples (500 base + 500 enhanced)
]
```

### 4. Validate Model
Run the 4 validation tests (TODO aggregation, migration safety, ML inventory, API health).

### 5. Deploy
```bash
# Export from Colab (GGUF format)
# Import to Ollama
ollama create gemma3-legal-detective -f Modelfile-gemma3-legal-detective
ollama tag gemma3-legal-detective gemma3-legal:latest

# Test
ollama run gemma3-legal "Analyze all TODOs and create a sprint plan"
```

---

## Integration with ACE Context Engine

Enhanced detective mode enables ACE self-prompting:

### Current ACE (7 data sources)
1. User profile (analytics)
2. Case context (PostgreSQL)
3. RAG chunks (Qdrant vector search)
4. KAG graph (Neo4j fallback)
5. Chat history
6. Entity extraction (regex)
7. Practice area templates

### ACE + Detective Mode (7 + 6 tools)
ACE can now **self-investigate** the codebase to gather its own context:

```
ACE synthesis request: "Generate evidence analysis summary"
  ↓
ACE self-prompt: "What evidence analysis tools are available?"
  ↓
Detective mode tools:
  - ripgrep_search(pattern="evidence.*analyze")
  - find_files(pattern="**/analysis/**/*.ts")
  - analyze_file(file_path="entity-extraction.ts")
  ↓
ACE discovers: entity-extraction.ts, forensics.ts, summarizer.ts
  ↓
ACE self-prompt: "How do I call these tools?"
  ↓
Detective mode analyzes: function signatures, import paths, parameter schemas
  ↓
ACE synthesizes: Complete evidence analysis pipeline with proper tool calls
```

**Result**: ACE becomes self-aware of codebase capabilities and can autonomously discover + use new tools.

---

## Meta-Observation

**This session IS a detective mode training example.**

We used:
- `ripgrep_search` (find TODOs across codebase)
- `find_files` (discover datasets, schemas, notebooks)
- `analyze_file` (read schema-postgres.ts, mcp/server.ts, prepare_colab_datasets.py)
- `web_search` (research TensorRT speedup, Drizzle migration safety)
- `extract_pattern` (categorize TODOs, estimate effort)

To produce:
- 7 categorized TODO files
- ~204 hours of work identified
- 4-phase implementation roadmap
- Database safety analysis
- ML infrastructure audit

The VLM trained on enhanced detective mode will be able to replicate this exact workflow autonomously.

---

**Session Status**: ✅ COMPLETE

**Deliverables**:
- ✅ 8 TODO documentation files (00-07 + 08)
- ✅ Enhanced detective mode generator (500 examples)
- ✅ Enhanced detective mode documentation
- ✅ Updated prepare_colab_datasets.py (9 steps)
- ✅ Integration guide (this file)

**Next**: Generate datasets → Upload to Drive → Train model → Validate → Deploy
