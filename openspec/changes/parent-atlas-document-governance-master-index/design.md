# Design: Parent Atlas Document Governance Master Index

## 1. Ownership model

Use one machine-readable registry as the canonical document-state owner. Everything else is a projection.

```text
repo files
  ├─ CLAUDE.md / scoped CLAUDE.md
  ├─ docs/**/*.md
  ├─ openspec/specs/**/*.md
  ├─ openspec/changes/**/{proposal,design,tasks,specs}
  └─ docs/reports/**/*
        ↓
read-only discovery + classification
        ↓
DocumentGovernanceRegistryV1
        ↓
  ┌─────┼───────────────┐
  ▼     ▼               ▼
MASTER-TOC.md   admin API/SSR   archive/supersession plan
```

`docs/MASTER-TOC.md` is generated and must never be treated as the state owner.

## 2. Record contract

```ts
type DocumentGovernanceStatus =
  | 'CANONICAL_CURRENT'
  | 'ACTIVE_SUPPORTING'
  | 'EXPERIMENTAL'
  | 'LEGACY_REFERENCE'
  | 'SUPERSEDED'
  | 'ARCHIVE_READY'
  | 'ARCHIVED'
  | 'CONFLICT';

interface DocumentGovernanceRecordV1 {
  schema: 'atlas.document-governance-record.v1';

  documentId: string;             // stable digest of normalized repo-relative path
  path: string;
  sha256: string;
  title: string | null;
  topicIds: string[];
  documentKind:
    | 'CLAUDE_INSTRUCTIONS'
    | 'ARCHITECTURE'
    | 'OPENSPEC_PROPOSAL'
    | 'OPENSPEC_SPEC'
    | 'OPENSPEC_DESIGN'
    | 'OPENSPEC_TASKS'
    | 'REPORT'
    | 'RUNBOOK'
    | 'HISTORICAL';

  status: DocumentGovernanceStatus;
  canonicalForTopics: string[];

  supersedes: string[];           // documentIds
  supersededBy: string[];         // documentIds
  supersessionReason?: string;

  openspecChange?: string;
  openspecTaskRefs?: string[];

  validation: {
    linksChecked: boolean;
    referencesChecked: boolean;
    smokePassed: boolean;
    testsPassed: boolean;
    contradictions: string[];
    receiptRefs: string[];
  };

  workflow?: {
    workflowId?: string;
    actionId?: string;
    progressFraction?: number;
    etaMs?: number;
    confidence?: number;
    lastEventRef?: string;
  };

  archive: {
    eligible: boolean;
    blockedReasons: string[];
    archivedPath?: string;
  };

  discoveredAt: string;
  updatedAt: string;
}
```

## 3. Topic ownership

Documents are grouped by explicit topic IDs, for example:

```text
parent-atlas.identity
parent-atlas.semantic-representations
parent-atlas.structural-evidence
parent-atlas.graph-execution
parent-atlas.agentic-workflows
parent-atlas.context-manifest
parent-atlas.bitfrost
parent-atlas.embedding-runtime
parent-atlas.document-governance
```

A topic may have exactly one `CANONICAL_CURRENT` document. Multiple supporting/experimental/history documents may reference it.

A detected multiple-canonical condition is `CONFLICT` and blocks archive/apply.

## 4. CLAUDE.md governance

Discover every case-insensitive `CLAUDE.md` / `claude.md` in repository scope.

Each instruction file receives:

```text
scopePath
sha256
parentInstructionFile?
canonicalTopics[]
supersedes[]
supersededBy[]
conflictingClaims[]
```

Do not mutate originals during discovery.

The master index exposes an instruction chain:

```text
root claude.md
  ↓ scope inheritance
sveltekit-frontend/CLAUDE.md
  ↓
package/feature scoped CLAUDE.md
```

Supersession and scope are different relations:

- `SCOPED_BY`: child adds/narrows instructions for a subtree.
- `SUPERSEDES`: newer document replaces an older claim/document.

Never infer `SUPERSEDES` merely because one file is newer.

## 5. Extraction/classification pipeline

```text
files
  ↓ exact path/type/frontmatter parsing
static metadata extraction
  ↓
rg exact references
  ↓
OpenSpec binding lookup
  ↓
optional semantic nomination / LLM extraction
  ↓
deterministic validation
  ↓
DocumentGovernanceRecordV1
```

LLM/semantic extraction may nominate:

- likely topic IDs
- likely supersession relationships
- likely canonical-document candidates
- consolidation recommendations

It may not promote any of those directly. Exact path references, explicit status/frontmatter, OpenSpec links, git history, and deterministic checks approve the final registry state.

## 6. OpenSpec binding

Implementation-changing document consolidation must have an OpenSpec change.

The governance workflow checks:

```text
proposal.md exists
specs exist or skip_specs explicitly configured
design.md exists when needed
tasks.md exists
```

Progress comes from `tasks.md` checkbox state. OpenSpec's apply phase already uses those checkboxes as the progress record.

When all tasks are checked, document governance may mark the change `ARCHIVE_CANDIDATE`, but actual OpenSpec archival remains the OpenSpec archive operation.

## 7. Agentic workflow binding

Do not invent a new workflow progress schema.

Reuse `WorkflowActionEventV1` and its existing:

```text
progress.completedUnits
progress.totalUnits
progress.fraction
progress.etaMs
progress.confidence
```

Finish the existing `parent-atlas-agentic-run-receipt-binding` change so workflow events can bind to an OpenSpec change and durable receipt ledger.

The document-governance registry stores only references/current rollups from workflow events; workflow events remain the runtime execution owner.

## 8. Progress and ETA semantics

`tasks.md` completion is authoritative for implementation progress:

```text
progressFraction = checkedTasks / totalTasks
```

Workflow ETA is accepted only from a current `WorkflowActionEventV1.progress.etaMs` with confidence. Do not fabricate ETA from task count alone.

The master TOC can display:

```text
Progress  7 / 10 tasks (70%)
ETA       14m, confidence 0.72
```

If no runtime ETA exists:

```text
ETA       unavailable
```

## 9. Supersession workflow

```text
new/changed canonical document
        ↓
discover references and likely predecessors
        ↓
create SupersessionPlanV1
        ↓
verify replacement covers required current claims
        ↓
OpenSpec task complete?
        ↓
reference/link smoke checks
        ↓
validation tests
        ↓
mark predecessor SUPERSEDED
        ↓
archive eligibility check
        ↓
optional explicit archive apply
```

No deletes during normal reconciliation.

## 10. Archive policy

Archive is allowed only if all are true:

```text
status == SUPERSEDED
supersededBy non-empty
no active CLAUDE.md or OpenSpec spec depends on original path
all replacement links resolve
OpenSpec change is complete or archive exemption is explicit
smokePassed == true
testsPassed == true
contradictions.length == 0
```

Prefer moving historical documents under a date/topic archive tree over deletion.

Suggested target:

```text
docs/archive/<yyyy-mm>/<topic>/<original-name>
```

OpenSpec changes continue to use OpenSpec's own `openspec/changes/archive/` lifecycle.

## 11. Tang-inspired recommendation status

Tang-inspired low-rank shortlisting is already recorded in `parent-atlas-memory-architecture-freeze` as `TANG_INSPIRED_LOW_RANK_SHORTLIST`, explicitly non-canonical. A read-only shortlist receipt also exists and currently reports `EXECUTED_UNPROVEN` with weak exact-semantic recall/overlap.

Document governance should surface:

```text
TANG_INSPIRED_LOW_RANK_SHORTLIST
status = EXPERIMENTAL
canonicalAuthority = false
promotion = blocked pending evaluation
```

Do not copy it into canonical architecture text as a promoted recommendation algorithm.

## 12. Parent Atlas admin integration

Use existing `/admin/atlas` rather than create another admin application.

Server side:

```text
+page.server.ts
  -> /api/admin/atlas/document-governance
  -> returns compact registry summary + current workflow progress
```

The registry/API is read-only in the first tranche.

Client side:

- Svelte 5 runes for local/filter state (`$state`, `$derived`, `$effect` only where side effects are needed).
- Bits UI `Tabs` for Current / OpenSpec / Superseded / Archive Ready / Conflicts.
- Bits UI `Progress` for task completion.
- Bits UI `Accordion` for per-topic document lineage and validation details.
- SSR provides the first render; client fetches refresh status on demand.

Do not parse the repository from the browser.

## 13. Generated master TOC shape

`docs/MASTER-TOC.md`:

```text
# Parent Atlas Master TOC
Generated from DocumentGovernanceRegistryV1. Do not edit by hand.

## Current canonical topics
| Topic | Canonical document | OpenSpec | Progress | Validation |

## Active OpenSpec changes
| Change | Tasks | Progress | ETA | Latest receipt |

## Superseded documents
| Original | Superseded by | Reason | Archive status |

## Experiments / challengers
| Capability | Status | Receipt | Promotion gate |

## Conflicts
...
```

## 14. Validation commands

Initial smoke set:

```bash
node scripts/atlas/build-document-governance-index.mjs --dry-run
node scripts/atlas/validate-document-governance-index.mjs
node scripts/atlas/build-master-toc.mjs --check
rg -n "SUPERSEDED|supersededBy|canonicalForTopics" docs openspec claude.md
```

Admin surface:

```bash
npx vitest run src/lib/server/atlas/document-governance/
npx vitest run src/routes/api/admin/atlas/document-governance/
npm run check
```

## 15. Safety

The first implementation tranche is read-only except for generated registry/TOC artifacts and the OpenSpec change itself. Moving or editing superseded originals requires a separately reviewed apply task.
