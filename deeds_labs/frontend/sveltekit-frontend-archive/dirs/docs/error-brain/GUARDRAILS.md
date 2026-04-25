# Error Brain: Guardrails

## Safety System Overview

The Error Brain enforces multiple layers of safety to prevent unintended code changes.

## Hash Guards

### Before Hash
- Computed: `SHA256(original_content)`
- Guards against: File modified after analysis

### After Hash
- Computed: `SHA256(proposed_content)`
- Guards against: Patch corruption during transport

### Enforcement
```typescript
if (sha256(current_content) !== beforeHash) {
  reject("File changed since analysis");
}
```

## Line Delta Cap

**Limit**: 80 lines (configurable via `ERROR_BRAIN_MAX_PATCH_LINES`)

**Rationale**: Large changes are:
- Harder to review
- More likely to break semantics
- Higher risk of merge conflicts

**Enforcement**: Patches exceeding limit are rejected automatically.

## One Patch Per File Per Run

**Rule**: A file can only be patched once per run.

**Rationale**:
- Prevents cascading changes
- Simplifies rollback
- Makes diffs reviewable

**Enforcement**: Second patch for same file is rejected with `DUPLICATE_PATCH`.

## Confidence Thresholds

### Safe Mode (0.95)
- Only high-confidence fixes
- Mechanical transformations only
- No semantic analysis required

### Full Mode (0.70)
- Medium-confidence fixes
- May involve pattern matching
- Human review recommended

## Apply Mode Defaults

**Default**: `off`

**Override**: Set `ERROR_BRAIN_APPLY_MODE` explicitly.

**Rationale**: Fail-safe design - no changes unless explicitly enabled.

## Idempotent Writes

### Report Files
```typescript
// Only write if content changed
if (existingContent !== newContent) {
  await writeFile(reportPath, newContent);
}
```

### Patch Application
- Check file hash before write
- Atomic file replacement
- Preserve original on failure

## File Existence Check

**Guard**: File must exist before patch.

**Rationale**: Don't create new files automatically.

**Exception**: None. Use explicit file creation outside Error Brain.

## Dry Run Mode

**Activation**: Set `dryRun: true` in apply options.

**Behavior**:
- All guards execute
- No files modified
- Full logging produced

**Use Case**: CI validation, testing

## Rate Limiting

### Per-Run Limits
- Max patches: 100 (configurable)
- Max run duration: 5 minutes
- Max concurrent runs: 10

### Global Limits
- Max disk usage: 1 GB for reports
- Max event queue: 10,000 events

## Error Handling

### Guard Failure
```typescript
type GuardResult =
  | { ok: true }
  | { ok: false; reason: string; code: string };
```

### Rejection Codes
- `FILE_NOT_FOUND`: File doesn't exist
- `HASH_MISMATCH`: Content changed
- `LINE_DELTA_EXCEEDED`: Too many changes
- `DUPLICATE_PATCH`: File already patched
- `CONFIDENCE_LOW`: Below threshold

## Rollback Strategy

### Manual Rollback
```bash
# Restore from git
git checkout HEAD -- path/to/file

# Or restore from apply-log
cat reports/patches/*/rb_*/apply-log.json
```

### Automated Rollback
Not implemented yet. Future: Store original content in apply-log.

## Verification Steps

After patch application:

1. **TypeScript Check**
   ```bash
   npx tsc --noEmit --skipLibCheck
   ```

2. **Syntax Validation**
   ```bash
   npm run lint
   ```

3. **Test Suite**
   ```bash
   npm test
   ```

## Isolation Guarantees

### No Cross-Contamination
- Error Brain endpoints: `/api/internal/error-brain/*`
- Chat endpoints: `/api/ai/*`, `/api/sse/*`
- Zero shared state between systems

### Transport Isolation
- SSE bus: Process-local only
- Redis: Separate channel namespace
- No reuse of generic helpers

## CI Integration

### Read-Only Mode
```yaml
env:
  ERROR_BRAIN_ENABLED: 1
  ERROR_BRAIN_APPLY_MODE: off  # Critical: never apply in CI
  ERROR_BRAIN_TRANSPORT: none
```

### Artifact Generation
```yaml
- name: Analyze errors
  run: curl -X POST http://localhost:5173/api/internal/error-brain/run

- name: Upload reports
  uses: actions/upload-artifact@v3
  with:
    name: error-brain-reports
    path: reports/
```

## Human-in-the-Loop

### Review Checklist
Before applying patches in `full` mode:

- [ ] Review unified diffs in `reports/patches/`
- [ ] Check confidence scores
- [ ] Verify beforeHash matches current state
- [ ] Run TypeScript check after application
- [ ] Test affected functionality

### Approval Gate
```bash
# Generate patches
export ERROR_BRAIN_APPLY_MODE=off
curl -X POST http://localhost:5173/api/internal/error-brain/run

# Human review
cat reports/patches/*/rb_*/apply-log.json

# Apply after approval
export ERROR_BRAIN_APPLY_MODE=safe
# Manually apply reviewed patches
```

## Incident Response

### Syntax Corruption Incident
See: [INCIDENT_SYNTAX_CORRUPTION.md](./INCIDENT_SYNTAX_CORRUPTION.md)

### Runaway Patches
1. Set `ERROR_BRAIN_APPLY_MODE=off`
2. Review apply-log for last N patches
3. Rollback via git
4. Investigate root cause

### Data Loss Prevention
- All patches logged with before/after hashes
- Git history remains source of truth
- Reports archived with timestamps
