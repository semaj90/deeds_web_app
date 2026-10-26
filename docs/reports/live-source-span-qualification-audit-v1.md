# Live Source-Span Qualification Audit (v1)

**Date**: 2026-10-19T08:22:54.977Z  
**Phase Boundary**: `PHASE_20_WRITE_PROHIBITION_ENFORCED` (Zero DB mutations, zero line-derived byte spans)  
**Status**: `FIXTURE_ONLY_CONFIRMED`

---

## 1. Table Census & Lineage Availability

| Table Name | Total Rows | Rows with `source_revision` | Rows with Byte Spans | Live Qualification Rate |
| :--- | :--- | :--- | :--- | :--- |
| **`codebase_chunk_index`** | 274,465 | **0 (0.0%)** | **0 (no columns)** | **0/20 (0%)** |
| **`atlas_symbol_versions`** | 479 | 479 (100%) | 479 (100%) | **1/5** |
| **`atlas_ast_nodes`** | 523,271 | 512,096 (97.9%) | 512,208 (97.9%) | **5/5** |
| **`atlas_workspace_source_bindings`** | 47,936 | 47,936 (100%) | N/A (file-level) | N/A |

---

## 2. Live Candidate Sample Results

### A. Canonical Dense Retrieval Candidates (`codebase_chunk_index`)
- Sampled **20 live chunks**.
- **Qualification**: 100% rejected (`MISSING_SOURCE_REVISION`).
- **Missing Join**: `codebase_chunk_index.source_revision IS NULL`.
- **Earliest Capable Owner**: `Phase 20 codebase_chunk_index backfill`.

### B. Structural Symbol Candidates (`atlas_symbol_versions`)
- Sampled **5 symbols**.
- Unchanged files (e.g. `src/app.d.ts`): **EXACT_SOURCE_PROVEN** with exact UTF-8 byte slices (e.g. `interface Error`).
- Mutated files: **SOURCE_DIGEST_MISMATCH** (file on disk changed after initial indexing).

### C. Tree-Sitter AST Nodes (`atlas_ast_nodes`)
- Sampled **5 AST nodes**.
- Unchanged files: **EXACT_SOURCE_PROVEN** with exact CST byte spans.
- Mutated files: **SOURCE_DIGEST_MISMATCH**.

---

## 3. Test Suite (7 Verification Modes)

| Test Mode | Expected Outcome | Observed Outcome | Status |
| :--- | :--- | :--- | :--- |
| 1. Valid UTF-8 Span Qualification | `EXACT_SOURCE_PROVEN` | `EXACT_SOURCE_PROVEN` | ✅ PASS |
| 2. CRLF vs LF Byte Offset Shift Observation | `CRLF_LF_SHIFT_DETECTED` | `CRLF_LF_SHIFT_DETECTED` | ✅ PASS |
| 3. Missing Source Path Rejection | `MISSING_SOURCE_PATH` | `MISSING_SOURCE_PATH` | ✅ PASS |
| 4. Missing Source Revision Rejection | `MISSING_SOURCE_REVISION` | `MISSING_SOURCE_REVISION` | ✅ PASS |
| 5. Missing Byte Span Rejection | `MISSING_BYTE_SPAN` | `MISSING_BYTE_SPAN` | ✅ PASS |
| 6. Stale Revision / Digest Mismatch Rejection | `SOURCE_DIGEST_MISMATCH` | `SOURCE_DIGEST_MISMATCH` | ✅ PASS |
| 7. Stale Ordinal Map / Checksum Mismatch | `STALE_ORDINAL_MAP` | `STALE_ORDINAL_MAP` | ✅ PASS |

---

## 4. Graphify Lifecycle & SearchRuntime Gates

- **Graphify Daily Lifecycle Receipt**: `COMPLETED` (`terminalStatus: COMPLETED`).
- **Production Promotion Gate**: `ELIGIBLE`.
- **Safety Policy**: No database writes, no receipt table modifications, no SearchRuntime ranking alterations, no GPU executions.

---

## 5. Smallest Phase 20-Compatible Patch Targets

1. **Read-Only Lineage View**: Establish a join view `v_chunk_source_lineage_v1` joining `codebase_chunk_index` to `atlas_workspace_source_bindings` on `source_ref = canonical_source_ref`.
2. **8095 Tree-sitter CST Byte-Span Resolver**: Map `line_start` / `line_end` to exact byte offsets via the running Tree-sitter CST service rather than approximate line arithmetic.
3. **Fixture-Only Contract Retention**: Until Phase 20 authorization is executed, keep Top-K evidence qualification in deterministic fixture mode.
