---
name: Session 108 P1 - SOM Contract Fix (Coordinate Clamping)
description: P1 ROOT BLOCKER - Fix 799/400 SOM cell contradiction via deterministic coordinate normalization
type: project
---

# SESSION 108 P1: SOM Contract Fix — Coordinate Clamping ROOT BLOCKER

**Status**: ⏳ **TODO** (Root blocker for CARD 3 Phases P2-P7)

**Why This is P0**:
The 799/400 contradiction means coordinates are NOT bounded to the 20×20 grid. Some classification script is assigning SOM cells outside [0-19]×[0-19], creating ghost cells beyond the contract. This breaks:
- Topology promotion (can't index into 20×20 SOM array with cell 799)
- Tree-node-ID ancestry tracking (tree_node_id calculation assumes 400 max cells)
- HMM error classification (error clusters map to SOM cells for ancestry)

**The Problem** (Architect's Diagnosis):
> "799/400 contradiction indicates a classification script is mapping items to unconstrained coordinates, bypassing your strict 20×20 spatial bounds."

**The Solution** (Deterministic Clamping):

### Step 1: Identify Which Script Creates SOM Coordinates

Likely culprits (search for som_cluster assignments):

```bash
rg "som_cluster\s*=" scripts/atlas/ sveltekit-frontend/src/lib/server/ --type js --type ts -n
# Look for: som_row, som_col assignments
# Expected patterns: Math.floor(latent_x / scale), Math.round(...), or hash-based indexing
```

### Step 2: Implement Deterministic Normalization

Create `src/lib/server/topology/som-coordinate-normalizer.ts`:

```typescript
/**
 * Normalizes continuous latent projection variables down to the 20×20 SOM contract
 * 
 * Contract: SOM grid is EXACTLY 20×20 = 400 cells
 * Coordinates must be integers in [0-19] × [0-19]
 * Linear cell ID: som_row * 20 + som_col (0-399)
 * 
 * This is a HARD gate: no coordinates outside [0-19]×[0-19] are valid.
 * Any script producing coordinates outside this range is violating the contract.
 */

export interface SomCoordinates {
  som_row: number;      // [0-19]
  som_col: number;      // [0-19]
  linear_cell_id: number;  // [0-399]
  confidence?: number;
}

export function normalizeSomCoordinates(
  rawX: number,
  rawY: number,
  options?: { confidence?: number; source?: string }
): SomCoordinates {
  // 1. Enforce strict mathematical bounding limits
  // Math.floor to discretize continuous output
  // Math.max/min to clamp to [0-19]
  const som_col = Math.max(0, Math.min(19, Math.floor(rawX)));
  const som_row = Math.max(0, Math.min(19, Math.floor(rawY)));

  // 2. Generate deterministic cell matrix offset index (0 to 399)
  const linear_cell_id = (som_row * 20) + som_col;

  // 3. Log if clamping occurred (signal data issue)
  if (rawX !== som_col || rawY !== som_row) {
    console.warn(
      `[SOM] Clamped coordinates: (${rawX}, ${rawY}) → (${som_col}, ${som_row}) ` +
      `[${options?.source || 'unknown'}]`
    );
  }

  return {
    som_row,
    som_col,
    linear_cell_id,
    confidence: options?.confidence ?? 0.5
  };
}

/**
 * Validate that ALL existing SOM coordinates respect the 20×20 contract
 * Used to audit the database and identify rows with invalid coordinates
 */
export function validateSomCoordinatesInPlace(
  som_row: number | null,
  som_col: number | null
): { valid: boolean; reason?: string } {
  if (som_row === null || som_col === null) {
    return { valid: true, reason: 'NULL coordinates (not yet assigned)' };
  }

  if (som_row < 0 || som_row > 19 || som_col < 0 || som_col > 19) {
    return {
      valid: false,
      reason: `Coordinates out of bounds: som_row=${som_row}, som_col=${som_col} (expected [0-19]×[0-19])`
    };
  }

  return { valid: true };
}

/**
 * Recovery: Fix rows with invalid SOM coordinates by re-normalizing
 * Used after identifying the root cause script
 */
export function recoverInvalidSomCoordinate(
  som_row: number | null,
  som_col: number | null
): SomCoordinates | null {
  if (som_row === null || som_col === null) {
    return null; // Can't recover NULL
  }

  const clamped = normalizeSomCoordinates(som_row, som_col, {
    source: 'recovery'
  });
  return clamped;
}
```

### Step 3: Audit Current SOM State

Run this query to identify the extent of the problem:

```sql
-- Check current SOM coordinate distribution
SELECT
  COUNT(*) as total_packets,
  COUNT(DISTINCT CASE WHEN som_row IS NULL THEN 1 END) as null_rows,
  COUNT(DISTINCT CASE WHEN som_col IS NULL THEN 1 END) as null_cols,
  MIN(som_row) as min_row,
  MAX(som_row) as max_row,
  MIN(som_col) as min_col,
  MAX(som_col) as max_col,
  COUNT(DISTINCT (som_row * 20 + som_col)) as unique_cells
FROM atlas_packets
WHERE som_row IS NOT NULL AND som_col IS NOT NULL;

-- Result should be:
-- total_packets: ~58,365
-- null_rows: 0
-- null_cols: 0
-- min_row: 0
-- max_row: 19 (NOT 799!)
-- min_col: 0
-- max_col: 19 (NOT 799!)
-- unique_cells: 400 (not 799!)
```

If `max_row` or `max_col` > 19, the contract is violated. Find rows with invalid coordinates:

```sql
-- Find all rows with out-of-bounds SOM coordinates
SELECT
  packet_key,
  som_row,
  som_col,
  som_cluster,
  COUNT(*) as count
FROM atlas_packets
WHERE (som_row IS NOT NULL AND som_row NOT BETWEEN 0 AND 19)
  OR (som_col IS NOT NULL AND som_col NOT BETWEEN 0 AND 19)
GROUP BY som_row, som_col, som_cluster, packet_key
ORDER BY som_row DESC, som_col DESC
LIMIT 100;

-- If this returns rows, you have invalid coordinates
```

### Step 4: Find Root Cause Script

Search for the script that generates SOM coordinates:

```bash
# Look for derive-topology or clustering scripts
ls -la scripts/atlas/*som* scripts/atlas/*cluster* scripts/atlas/*topology*

# Examine the likely culprit
cat scripts/atlas/derive-topology.mjs | grep -A 10 "som_row\|som_col"
# or
cat scripts/atlas/seed-som-topology.mjs | grep -A 10 "som_row\|som_col"

# Search for autoencoder output → SOM mapping
rg "autoencoder.*som|latent.*som|encode.*som" scripts/atlas/ --type js -n
```

### Step 5: Apply the Fix

Once the root cause script is identified, add the normalizer:

```javascript
// Inside the script that assigns som_row/som_col:

import { normalizeSomCoordinates } from '..src/lib/server/topology/som-coordinate-normalizer.js';

// Instead of:
// packet.som_row = Math.round(latent_y);
// packet.som_col = Math.round(latent_x);

// Do:
const normalized = normalizeSomCoordinates(latent_x, latent_y, {
  source: 'derive-topology.mjs',
  confidence: confidence_score
});
packet.som_row = normalized.som_row;
packet.som_col = normalized.som_col;
```

### Step 6: Recover Existing Invalid Rows

If invalid coordinates exist, create a recovery migration:

```sql
-- drizzle/manual/0999_som_coordinate_recovery.sql
-- Clamp all out-of-bounds SOM coordinates to valid range

UPDATE atlas_packets
SET
  som_row = LEAST(19, GREATEST(0, som_row)),
  som_col = LEAST(19, GREATEST(0, som_col))
WHERE som_row IS NOT NULL AND som_col IS NOT NULL
  AND (som_row < 0 OR som_row > 19 OR som_col < 0 OR som_col > 19);

-- Verify
SELECT COUNT(*) FROM atlas_packets
WHERE som_row IS NOT NULL AND som_col IS NOT NULL
  AND (som_row < 0 OR som_row > 19 OR som_col < 0 OR som_col > 19);
-- Expected: 0
```

### Step 7: Validation Gates

```
✅ G1: normalizeSomCoordinates() function exists and is imported everywhere som_row/som_col are assigned
✅ G2: All new SOM coordinate assignments go through normalizer
✅ G3: Database audit shows max(som_row) ≤ 19 AND max(som_col) ≤ 19
✅ G4: SELECT COUNT(DISTINCT (som_row * 20 + som_col)) returns 400 (not 799)
✅ G5: No rows have som_row > 19 or som_col > 19
✅ G6: Recovery migration applied (if needed)
✅ G7: tree_node_id calculation now works correctly (depends on 400 cells)
```

## Why This Blocks Everything

CARD 3 Phase dependencies:
- P2 (qdrant_point_id determinism) needs tree_node_id propagation
- P3 (tree_node_id propagation) needs SOM coordinates to be valid (ancestry calculation)
- P6 (promotion policy) uses `som_cluster` as topology promotion gate
- P7 (ACP closure) validates tree_node_id in topology

If SOM has 799 cells instead of 400, all topology-based promotion fails. This is the load-bearing gate.

## Execution Plan

**Session 108 Immediate**:
1. Run audit query → identify coordinate range
2. Find root cause script → add normalizer
3. Apply recovery migration (if needed)
4. Verify validation gates 1-7

**Expected Time**: 1-2 hours

**Acceptance**: All 7 gates PASS, `max(som_row)=19`, `max(som_col)=19`, `unique_cells=400`

---

**After P1 is FIXED**: CARD 3 P2-P7 unblock and can proceed in parallel.

**Current Status**: ⏳ **AWAITING SOM AUDIT RESULTS**
