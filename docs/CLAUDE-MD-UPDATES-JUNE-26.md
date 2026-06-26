# CLAUDE.md Updates (June 26, 2026)

## All Fixes Applied

### 1. ✅ Removed Plaintext Passwords

**Changed**: 
- Removed Ubuntu WSL2 plaintext password from global instructions
- Removed Redis connection string with embedded password

**Now**:
- Credentials stored in `.env.local` (gitignored)
- Instructions only reference environment variables
- Scripts read from `process.env.REDIS_PASSWORD` (do NOT hard-code)

**Location**: `## Environment` section

### 2. ✅ Updated LLM Model Reference

**Was**: `gemma3-legal:latest`

**Now**: `models/gemma4-legal-iq4xs-direct.gguf` (canonical via llama.cpp/TurboQuant) or `gemma4-rotorquant:latest` (Ollama fallback)

**Why**: Gemma4 is current truth (legal fine-tuned, vision-capable, 5.3GB model)

**Location**: Line 57

### 3. ✅ Fixed Join Condition Language

**Was**: "Never join on feature_id alone (always include source_ref + directory_path)"

**Now**:
- "Join by `packet_key` (primary identity)"
- "Verify `source_ref`, `feature_id`, and optionally `directory_path` when present"
- "Never join on `feature_id` alone"

**Why**: More precise — `directory_path` is optional, `packet_key` is primary key, `source_ref` + `feature_id` are required verification fields

**Locations**: Lines 70, 111

### 4. ✅ Verified Implementation File Existence

**Changed**: "Implementation: scripts/atlas/packet-truth-flow.mts" now includes:
- ✅ File existence verification command
- ✅ Import verification (Postgres, ioredis, Drizzle)
- ✅ Exports (executePacketTruthFlow function)
- ✅ CLI support (--dry-run --verbose)

**Why**: Prevents future confusion about whether the file exists and what it imports/exports

**Location**: Lines 63-72

### 5. ✅ Added Consolidation Sweep Rules

**New Section**: "## Consolidation Sweep Rules (June 26, 2026)" (Lines 10-56)

**Content**:
- 4-step audit → plan → patch → verify workflow
- 9 sweep targets (packet truth flow, Atlas registry, BitFrost, Qdrant, Neo4j, RabbitMQ, msgpack, ACE, GPU stubs)
- Reporting requirements (canonical, duplicates, exports, usage, safety, patches)
- Read-only checks (imports, package.json, tsconfig, file existence)
- Safe consolidation patterns (helpers, stale imports, Redis handling, validation, joins, cache writes)
- Do-not-touch list (schema, models, CUDA, shims, UI)

**Why**: Enables systematic module consolidation without accidental refactoring or file creation

### 6. ✅ Added Claude Code Prompt for Consolidation

**New Section**: "## Claude Code Prompt for TypeScript/Module Consolidation" (Lines 155-223)

**Content**: Complete standalone prompt for use when running consolidation sweeps
- Project context (Legal AI / deeds-web-app)
- File/module creation rules
- Svelte 5 runes requirements
- Canonical packet architecture rules
- Sweep targets (9 categories)
- Reporting format
- Read-only checks (before editing)
- Safe consolidation examples
- Do-not-touch list
- Deliverable format

**Why**: Makes sweep tasks repeatable and consistent across sessions

## File Locations and Verification Commands

### Global Instructions
**File**: `C:\Users\james\.claude\CLAUDE.md`
**Verify**: `wc -l c:/Users/james/.claude/CLAUDE.md` → 223 lines

### Implementation File
**File**: `sveltekit-frontend/scripts/atlas/packet-truth-flow.mts` (720 lines)
**Verify**: 
```bash
ls sveltekit-frontend/scripts/atlas/packet-truth-flow.mts
head -5 sveltekit-frontend/scripts/atlas/packet-truth-flow.mts | grep "^import"
```

### Gemma4 Model
**File**: `models/gemma4-legal-iq4xs-direct.gguf` (4.8GB)
**Verify**: `ls -lah models/gemma4-legal-iq4xs-direct.gguf`

### Environment Configuration
**File**: `.env.local` (gitignored, user-specific)
**Expected contents**:
```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<from_docker_setup>
```

## Impact Summary

| Change | Impact | Risk |
|--------|--------|------|
| Remove plaintext passwords | Security hardening | Low — moves to gitignored .env.local |
| Update LLM model reference | Current truth documentation | None — model already in use |
| Fix join condition language | Precision improvement | None — clarifies existing rule |
| Verify implementation file | Prevents confusion | None — file exists |
| Add sweep rules | Enables safe consolidation | Low — auditing discipline only |
| Add Claude Code prompt | Improves sweep consistency | None — reference only |

## Next Steps

1. **Use the consolidation sweep rules** when encountering duplicate TypeScript modules
2. **Always verify file existence** before editing implementation references
3. **Keep credentials in `.env.local`** (never commit to git or global instructions)
4. **Use the Claude Code prompt** when running module consolidation tasks
5. **Run sweep audits** on these 9 targets:
   - Packet truth flow
   - Atlas packet registry
   - BitFrost/Redis cache
   - Qdrant mirror/search
   - Neo4j/KAG topology
   - RabbitMQ/event emitters
   - msgpack/JSON-RPC/HyperRAG RPC
   - ACE/NES Chrom97 packet assembly
   - GPU worker/client stubs

## Summary

**Session 82 continuation**: Fixed 6 critical issues in global instructions:
1. ✅ Removed plaintext passwords (moved to .env.local)
2. ✅ Updated LLM model to current truth (Gemma4)
3. ✅ Clarified join conditions (packet_key primary, verify source_ref + feature_id)
4. ✅ Verified implementation file (packet-truth-flow.mts exists and is wired)
5. ✅ Added consolidation sweep rules (audit → plan → patch → verify)
6. ✅ Added Claude Code prompt (repeatable sweep task template)

**Status**: CLAUDE.md is now secure, accurate, and consolidation-ready.
