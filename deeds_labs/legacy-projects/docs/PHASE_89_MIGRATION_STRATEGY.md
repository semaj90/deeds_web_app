# Phase 89.3: Agentic Svelte 5 Migration Strategy

## Overview

Phase 89.2 successfully tagged 73,313 error embeddings with migration metadata. Phase 89.3 implements an agentic fixing strategy to systematically migrate Svelte 4 patterns to Svelte 5.

## Migration Metadata (Phase 89.2 Results)

```
✅ Collections Enhanced:
├─ phase90_cuda_embeddings: 73,313 points
├─ fastmcp_file_profiles: 6,002 points
└─ 5 Indexed Fields Created

📊 Detection Results:
├─ Svelte 4 patterns: 1,415 detections
├─ Route consolidation: 220 candidates
└─ Melt-UI legacy: 0 (already migrated)

🏷️ Migration Flags:
├─ svelte4_props: export let declarations
├─ svelte4_reactive: $: reactive statements
├─ svelte4_events: createEventDispatcher
├─ svelte4_slots: <slot name="">
└─ svelte4_context: setContext/getContext
```

## Fix Strategy

### Phase 89.3.1: Pattern Detection Refinement

**Issue**: Current tagger flagged TypeScript files (`.ts`) as needing Svelte migration
**Solution**: Add file extension filtering to only process `.svelte` files

```python
def detect_svelte4_patterns(self, file_path: str) -> List[str]:
    # Only process .svelte files
    if not file_path.endswith('.svelte'):
        return []

    # ... pattern detection
```

### Phase 89.3.2: Svelte 4→5 Transformations

#### 1. Props Migration (`svelte4_props`)

**Svelte 4**:
```svelte
<script>
export let name = 'World';
export let count: number = 0;
export let optional;
</script>
```

**Svelte 5**:
```svelte
<script>
let { name = 'World', count = 0, optional } = $props();
</script>
```

**Transformation Rules**:
- Collect all `export let` declarations
- Group by type annotations
- Generate single `$props()` destructuring
- Support `$bindable()` for two-way binding

#### 2. Reactive Statements (`svelte4_reactive`)

**Svelte 4**:
```svelte
<script>
$: double = count * 2;
$: console.log(count);
</script>
```

**Svelte 5**:
```svelte
<script>
let double = $derived(count * 2);
$effect(() => {
    console.log(count);
});
</script>
```

**Transformation Rules**:
- Simple assignments → `$derived()`
- Side effects → `$effect()`
- Detect expression type automatically

#### 3. Event Dispatchers (`svelte4_events`)

**Svelte 4**:
```svelte
<script>
import { createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();

function handleClick() {
    dispatch('click', { value: 42 });
}
</script>
```

**Svelte 5**:
```svelte
<script>
let { onclick } = $props();

function handleClick() {
    onclick?.({ value: 42 });
}
</script>
```

**Transformation Rules**:
- Remove `createEventDispatcher` import
- Convert `dispatch('eventName')` → callback props
- Add to `$props()` destructuring

#### 4. Slots (`svelte4_slots`)

**Svelte 4**:
```svelte
<slot name="header"></slot>
<slot></slot>
<slot name="footer"></slot>
```

**Svelte 5**:
```svelte
{@render children?.header?.()}
{@render children?.()}
{@render children?.footer?.()}
```

**Transformation Rules**:
- Named slots → `{@render children?.slotName?.()}`
- Default slot → `{@render children?.()}`
- Add `children` to `$props()`

### Phase 89.3.3: Execution Strategy

```
┌─────────────────────────────────────────┐
│ 1. Query Qdrant (migration metadata)   │
│    ├─ Filter: needs_svelte5_migration  │
│    ├─ Sort: By priority (critical→low) │
│    └─ Limit: Configurable batch size   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 2. File Extension Validation           │
│    ├─ Only process .svelte files       │
│    └─ Skip .ts, .js files               │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 3. Backup Original Files                │
│    └─ .migration_backups/{file}.{ts}.bak│
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 4. Apply Transformations                │
│    ├─ Export let → $props()             │
│    ├─ $: → $derived()/$effect()         │
│    ├─ createEventDispatcher → callbacks│
│    └─ Slots → {@render}                 │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 5. Validate Syntax                      │
│    └─ Run svelte-check on modified file │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ 6. Update Qdrant Metadata               │
│    ├─ Set migrated: true                │
│    ├─ Add migration_applied_at          │
│    └─ Update migration_status           │
└─────────────────────────────────────────┘
```

### Phase 89.3.4: Validation & Rollback

**Pre-Migration Validation**:
```bash
# Check current error count
npx svelte-check --output machine

# Capture baseline
python phase89_3_agentic_fixer.py --dry-run --limit 10
```

**Post-Migration Validation**:
```bash
# Re-run svelte-check
npx svelte-check --output machine

# Compare error counts
# If errors increased, auto-rollback
```

**Rollback Strategy**:
```python
def rollback_migration(self, file_path: Path):
    """Restore from backup if migration caused errors"""
    backup_files = sorted(
        self.backup_dir.glob(f"{file_path.name}.*.bak"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    if backup_files:
        latest_backup = backup_files[0]
        file_path.write_text(latest_backup.read_text())
        return True
    return False
```

## Execution Plan

### Step 1: Refine Detection (Fix False Positives)

```bash
# Re-run Phase 89.2 with .svelte filter
python backend/scripts/phase89_2_migration_tagger.py \
    --file-filter "*.svelte" \
    --dry-run
```

### Step 2: Dry-Run Migration (Preview Changes)

```bash
# Test on 5 high-priority files
python backend/scripts/phase89_3_agentic_fixer.py \
    --dry-run \
    --priority high \
    --limit 5
```

### Step 3: Gradual Rollout

```bash
# Migrate 10 files at a time
for i in {1..10}; do
    python backend/scripts/phase89_3_agentic_fixer.py \
        --priority high \
        --limit 10

    # Validate
    npx svelte-check --output machine

    # If errors increased, rollback
    if [ $? -ne 0 ]; then
        echo "Migration failed, rolling back..."
        git checkout -- sveltekit-frontend/src/
        break
    fi
done
```

### Step 4: Full Migration

```bash
# Process all files
python backend/scripts/phase89_3_agentic_fixer.py \
    --priority critical \
    --limit 1000

python backend/scripts/phase89_3_agentic_fixer.py \
    --priority high \
    --limit 1000

# Medium/low as needed
```

## Success Metrics

```
Before Phase 89.3:
├─ TypeScript errors: 73,313
├─ Svelte 4 patterns: 1,415
└─ Migration ready: 0%

Target After Phase 89.3:
├─ TypeScript errors: <50,000 (30% reduction)
├─ Svelte 4 patterns: 0
└─ Migration complete: 100%

Stretch Goal:
├─ TypeScript errors: <10,000 (86% reduction)
├─ All components Svelte 5 compliant
└─ Zero runtime migration warnings
```

## Next Steps

1. ✅ Phase 89.2: Metadata tagging (COMPLETE)
2. ✅ Phase 89.3: Agentic fixer script (CREATED)
3. ⏳ Phase 89.3.1: Add .svelte file filtering
4. ⏳ Phase 89.3.2: Test dry-run on actual .svelte files
5. 🎯 Phase 89.3.3: Gradual rollout (10 files → 50 → 100 → all)
6. 🎯 Phase 89.4: Validate with svelte-check
7. 🎯 Phase 89.5: Update Qdrant with migration status
