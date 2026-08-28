# Parent Atlas REL-01A — Current Feature/Ontology Cohort Audit

This bundle adds the **smallest safe next relationship-lineage gate**.

It does **not** materialize relationships and does **not** change PostgreSQL,
Qdrant, Neo4j, Valkey, CandidateOrdinal, or GPU state.

## What it proves

The audit answers one question:

> Do any `feature_ontology_tuples` with predicate `USES_CONCEPT` have a literal,
> unique binding to a `graphify_files` source observation for the current
> `sha256:` workspace/source-manifest revision?

It deliberately does **not** use:

- `atlas_packets.workspace_revision`
- historical `git:` workspace revisions
- normalized paths
- basenames
- suffix matching
- fuzzy matching
- cross-domain hash equality
- `tree_node_id` as a graph revision
- caller-supplied graph revisions

If eligible rows exist, the next gate is `REL-01B`: preview relationship kernels
from exactly that current cohort. If none exist, source-binding reconciliation
remains the blocker.

---

## Files in this bundle

Copy these files into the repository root, preserving paths:

```text
scripts/atlas/lib/feature-ontology-current-cohort-v1.mjs
scripts/atlas/audit-feature-ontology-current-cohort-v1.mjs
packages/parent-atlas/test/feature-ontology-current-cohort-v1.test.mjs
```

The audit writes this generated report when run:

```text
docs/reports/feature-ontology-current-cohort-v1.json
```

Do **not** copy a generated report from this ZIP; generate it against your local
database/workspace.

---

## Where to integrate

From the root of `deeds_web_app`, the resulting tree should look like:

```text
deeds_web_app/
├─ scripts/
│  └─ atlas/
│     ├─ connection-config.mjs                 # already exists
│     ├─ audit-feature-ontology-current-cohort-v1.mjs   # NEW
│     └─ lib/
│        └─ feature-ontology-current-cohort-v1.mjs      # NEW
├─ packages/
│  └─ parent-atlas/
│     └─ test/
│        └─ feature-ontology-current-cohort-v1.test.mjs # NEW
└─ docs/
   └─ reports/
      └─ feature-ontology-current-cohort-v1.json         # GENERATED
```

This belongs under `scripts/atlas` **before** package promotion. It is a
read-only proof/audit tranche, not a new runtime owner.

Do not put this in:

- the `:8095` structural sidecar
- the `:8098` RAPIDS/GPU sidecar
- Qdrant
- Neo4j
- the CandidateFeatureMatrix CUDA path

Relationship lineage must become current before any of those downstream
consumers can use relationship graph features.

---

## Install / copy

### PowerShell

If the ZIP is extracted beside your repo:

```powershell
$bundle = "parent-atlas-rel-01a-current-ontology-cohort"
$repo = "C:\path\to\deeds_web_app"

Copy-Item "$bundle\scripts\atlas\lib\feature-ontology-current-cohort-v1.mjs" `
  "$repo\scripts\atlas\lib\feature-ontology-current-cohort-v1.mjs"

Copy-Item "$bundle\scripts\atlas\audit-feature-ontology-current-cohort-v1.mjs" `
  "$repo\scripts\atlas\audit-feature-ontology-current-cohort-v1.mjs"

Copy-Item "$bundle\packages\parent-atlas\test\feature-ontology-current-cohort-v1.test.mjs" `
  "$repo\packages\parent-atlas\test\feature-ontology-current-cohort-v1.test.mjs"
```

Or simply merge the extracted `scripts/` and `packages/` folders into the repo
root.

---

## Validation order

Run from the repo root.

### 1. Syntax

```bash
node --check scripts/atlas/lib/feature-ontology-current-cohort-v1.mjs
node --check scripts/atlas/audit-feature-ontology-current-cohort-v1.mjs
```

### 2. Focused unit tests

```bash
node --test packages/parent-atlas/test/feature-ontology-current-cohort-v1.test.mjs
```

Expected: 6 tests pass.

### 3. Read-only live cohort audit

```bash
node scripts/atlas/audit-feature-ontology-current-cohort-v1.mjs
```

The script loads the same repo environment through:

```text
scripts/atlas/connection-config.mjs
```

and obtains the current workspace revision from:

```text
docs/reports/workspace-source-binding-observation.json
```

You can override only the workspace revision for a controlled proof:

```powershell
$env:ATLAS_WORKSPACE_REVISION = "sha256:<current-manifest-revision>"
node scripts/atlas/audit-feature-ontology-current-cohort-v1.mjs
```

The override still fails closed unless it starts with `sha256:`.

### 4. Inspect the receipt

```text
docs/reports/feature-ontology-current-cohort-v1.json
```

Important fields:

```text
status
counts.exactSourceRefs
counts.currentWorkspaceSourceRefs
counts.currentWorkspaceTuples
counts.uniqueCurrentBindings
counts.eligibleUsesConceptTuples
counts.eligibleExactSourceRefs
relationshipGraphRevision
nextGate
```

`relationshipGraphRevision` is intentionally `null` in REL-01A.

---

## Decision rule

### If this is non-zero

```text
counts.eligibleUsesConceptTuples > 0
```

and:

```text
status = CURRENT_RELATIONSHIP_COHORT_FOUND
nextGate = REL_01B_PREVIEW_CURRENT_EXACT_RELATIONSHIP_KERNELS
```

then build **REL-01B** by feeding only those exact current bindings into the
existing feature-ontology relationship preview.

Do **not** use the old ordered `LIMIT 603` selection as the definition of the
current cohort.

After REL-01B produces a non-empty current kernel set:

```text
REL-01B
  → GraphRevisionV1
  → derive relationshipGraphRevision
  → ALIGN-01 SymbolFeatureAlignmentV1
  → CandidateOrdinal snapshot
  → [C,25] matrix identity parity
  → GPU-33
```

### If this is zero

```text
counts.eligibleUsesConceptTuples = 0
```

and:

```text
status = CURRENT_RELATIONSHIP_COHORT_EMPTY
nextGate = SOURCE_BINDING_RECONCILIATION_REQUIRED
```

do not materialize relationships and do not manufacture a graph revision.
Continue explicit source-binding/alias reconciliation.

---

## Existing relationship materializer

After REL-01A, you may re-run the existing materializer only as a smoke check:

```bash
node scripts/atlas/materialize-feature-ontology-relationships-v1.mjs --limit=603
```

Keep `--apply` **absent**.

That 603-row command remains a bounded preview, not a census of all
feature-ontology source refs.

---

## Optional package.json shortcut

Do not replace existing scripts. If you want a convenience alias, add this
entry to the repository-level `package.json` scripts object:

```json
{
  "atlas:ontology:current-cohort:audit": "node scripts/atlas/audit-feature-ontology-current-cohort-v1.mjs"
}
```

Then run:

```bash
npm run atlas:ontology:current-cohort:audit
```

---

## Safety / ownership boundary

This bundle preserves the frozen ownership model:

```text
:8095  structural CPU sidecar
       Tree-sitter / structural observations
       no CUDA ownership
       no canonical identity ownership

:8098  GPU accelerator sidecar
       PyTorch / cuVS / cuGraph / CuPy / optional TensorRT
       no AST canonical ownership
       no RRF ownership
       no graph truth ownership

Parent Atlas control/truth plane
       Postgres canonical identity + revisions
       Graphify source observations
       relationship revision contracts
       CandidateOrdinal / feature-matrix identity
```

REL-01A stays entirely in the Parent Atlas control/proof plane.
