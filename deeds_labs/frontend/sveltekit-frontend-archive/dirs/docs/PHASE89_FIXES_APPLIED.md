# Phase 89 Fixes & Best Practices

This document summarizes the fixes applied after Phase 89 integration verification.

## 📦 Files Created

| File | Purpose |
|------|---------|
| `data/knowledge/operators/phase89-ts1005-playbook.md` | KB document correcting TS1005 misconceptions |
| `scripts/cuda_smoketest/CMakeLists.txt` | CMake config for CUDA toolchain test |
| `scripts/cuda_smoketest/main.cu` | CUDA C++ smoketest (device detection + kernel launch) |
| `scripts/cuda_smoketest/build-and-run.ps1` | Build & run script for CUDA smoketest |
| `scripts/benchmark-cuda-pytorch.py` | PyTorch-based benchmark (alternative to CuPy) |

## 🔧 Files Modified

| File | Change |
|------|--------|
| `scripts/phase89-verify-integration.ps1` | Added Docker fallback for Redis/PostgreSQL checks |

---

## 🚀 Quick Commands

### 1. Run Phase89 Agentic Fixer (already built)
```powershell
cd sveltekit-frontend

# Fix TS1005 errors (most common)
node scripts/phase89-agentic-fixer.mjs --error-code TS1005 --limit 100

# With Gemini web search for solutions
node scripts/phase89-agentic-fixer.mjs --error-code TS1005 --web-search

# Show language-aware statistics
node scripts/phase89-agentic-fixer.mjs --lang-stats
```

### 2. Run Similarity Ranker (view similar errors)
```powershell
# Search by text
node scripts/phase89-similarity-ranker.mjs "error TS1005"

# Auto mode: find top clusters + web search
node scripts/phase89-similarity-ranker.mjs --auto
```

### 3. Test CUDA Toolchain
```powershell
# CMake/NVCC test (proves C++ CUDA works)
.\scripts\cuda_smoketest\build-and-run.ps1

# PyTorch CUDA benchmark (uses your .venv)
.\.venv\Scripts\python.exe scripts/benchmark-cuda-pytorch.py
```

### 4. Verify Phase89 Integration
```powershell
.\scripts\phase89-verify-integration.ps1
```

---

## 📋 TS1005 Error Fix Strategy

**Key insight:** TS1005 is a **downstream parse symptom**, not a root cause.

### Common Corruption Patterns in This Codebase

| Corrupted | Correct | Regex Pattern |
|-----------|---------|---------------|
| `string: undefined` | `string \| undefined` | `(\w+):\s*undefined` → `$1 \| undefined` |
| `(x: number), number:` | `(x: number, y: number):` | Parameter corruption |
| `{ timeout || 30000: retries: 3 }` | `{ timeout: 30000, retries: 3 }` | Object literal corruption |

### Fix Workflow
1. Find earliest TS1005 in file (lowest line number)
2. Inspect ~20 lines above for unmatched braces/parens
3. Fix the structural issue
4. Run formatter: `npx prettier --write <file>`
5. Verify: `npx tsc --noEmit <file>`

---

## 🐳 Docker Container Notes

Your Phase66 containers hold the databases:

| Container | Port | Purpose |
|-----------|------|---------|
| `phase66-postgres` | 5434 | PostgreSQL with pg_vector |
| `phase66-redis` | 6379 | Redis cache |
| `phase66-qdrant` | 6333/6334 | Qdrant vector DB |

### Direct access (when local CLI missing)
```powershell
# Redis
docker exec phase66-redis redis-cli PING

# PostgreSQL
docker exec phase66-postgres psql -U user -d legal -c "SELECT COUNT(*) FROM raw_error_embeddings"

# Qdrant
curl http://localhost:6333/collections/error_embeddings
```

---

## 💡 Recommendations

### For Your 113,796 Errors
1. **Priority order:** Fix TS1005 → TS1144 → TS1131 (cascading parse errors)
2. **Target files with multiple errors first** (they're likely structurally corrupted)
3. **Use Phase89 embeddings** to find clusters of similar errors
4. **Store fix patterns in KB** for future agent learning

### For CUDA Acceleration
1. Use **PyTorch benchmark** (`benchmark-cuda-pytorch.py`) - already works with your venv
2. For raw NVCC proof, run the **CUDA smoketest** CMake project
3. CuPy requires separate installation: `pip install cupy-cuda12x`

### For Verification Script
The updated script now tries Docker containers as fallback when local `redis-cli` and `psql` are missing.
