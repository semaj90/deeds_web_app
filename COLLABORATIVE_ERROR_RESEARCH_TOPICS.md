# Collaborative Error Research Topics
## AI + Human Dual Fixing Guide

**Date**: February 8, 2026
**Current Errors**: 787 svelte-check errors
**Goal**: Systematic reduction through collaborative fixing

---

## 🎯 How to Use This Guide

This document identifies error patterns that benefit from **dual fixing** (AI + Human collaboration):

1. **AI Strengths**: Pattern matching, bulk operations, syntax fixes
2. **Human Strengths**: Context understanding, design decisions, complex logic
3. **Collaboration**: Combine both for maximum efficiency

---

## 📋 Priority 1: High-Impact Research Topics (Quick Wins)

### Topic 1: Mismatched Quotes in Ternary Expressions
**Error Count**: ~10-15 instances
**Complexity**: ⭐⭐ (Medium)
**AI Role**: Find patterns
**Human Role**: Verify correct quote type

**Pattern**:
```svelte
<!-- ❌ Error: Mismatched quotes -->
{condition ? 'value1...' : 'value2..."}
                                    ^ double quote instead of single

<!-- ✅ Fixed -->
{condition ? 'value1...' : 'value2...'}
```

**Example Locations**:
- Modal components (success/error messages)
- Button styling (conditional classes)
- Form validation messages

**Research Questions**:
1. Should we standardize on single or double quotes?
2. Are there ESLint rules we can enforce?
3. Can we create a fixer that respects quote style preferences?

**Action Items**:
- [ ] Human: Define quote style standard (single vs double)
- [ ] AI: Create quote-mismatch fixer based on standard
- [ ] Human: Review and approve automated changes

---

### Topic 2: Unclosed Template Expressions
**Error Count**: ~20 instances
**Complexity**: ⭐⭐⭐ (High - requires context)
**AI Role**: Identify unclosed braces
**Human Role**: Determine correct closing point

**Pattern**:
```svelte
<!-- ❌ Error: Missing closing brace -->
<div class="text {messageType === 'success' ? 'green' : 'red"
     Content continues...

<!-- ✅ Fixed -->
<div class="text {messageType === 'success' ? 'green' : 'red'}">
     Content continues...
```

**Why Human Input Needed**:
- May span multiple lines
- Unclear where expression should end
- Could affect surrounding HTML structure

**Research Questions**:
1. Are these caused by copy-paste errors?
2. Do we need better editor configuration (bracket matching)?
3. Should we add pre-commit hooks to catch these?

**Action Items**:
- [ ] AI: Generate list of files with unclosed expressions
- [ ] Human: Review each file to determine correct closing point
- [ ] AI: Apply fixes based on human guidance
- [ ] Human: Test affected components

---

### Topic 3: Missing Commas in Object Literals
**Error Count**: ~21 instances
**Complexity**: ⭐ (Low - straightforward)
**AI Role**: Detect and fix pattern
**Human Role**: Verify no logical changes

**Pattern**:
```typescript
// ❌ Error: Missing comma
const config = {
  option1: true
  option2: false  // Missing comma
};

// ✅ Fixed
const config = {
  option1: true,
  option2: false
};
```

**Files to Check**:
- `src/lib/data/route-groups-config.ts`
- `src/lib/components/ui/NESElementsShowcase.svelte`
- Various service configuration files

**Action Items**:
- [ ] AI: Run targeted comma fixer on identified files
- [ ] Human: Quick review of changes
- [ ] AI: Commit if approved

---

## 📋 Priority 2: Medium-Impact Research Topics

### Topic 4: Block Closing Tag Mismatches
**Error Count**: 40 instances
**Complexity**: ⭐⭐⭐⭐ (Very High - template structure)
**AI Role**: Identify mismatches
**Human Role**: Fix template logic

**Pattern**:
```svelte
<!-- ❌ Error: Unexpected closing tag -->
{#if condition}
  <div>Content</div>
{/each}  <!-- Wrong closing tag! Should be {/if} -->

<!-- ✅ Fixed -->
{#if condition}
  <div>Content</div>
{/if}
```

**Why Complex**:
- Requires understanding full template structure
- May involve nested blocks
- Logic flow must be preserved

**Research Questions**:
1. Are these from refactoring gone wrong?
2. Can we use AST analysis to detect these?
3. Should we enforce template linting?

**Action Items**:
- [ ] AI: Generate template structure report for each file
- [ ] Human: Review and fix template logic
- [ ] Human: Test component rendering
- [ ] AI: Document common patterns for future prevention

---

### Topic 5: CSS Syntax Errors (Unclosed Braces)
**Error Count**: 20+ instances
**Complexity**: ⭐⭐ (Medium)
**AI Role**: Find unclosed braces
**Human Role**: Verify style intentions

**Pattern**:
```css
/* ❌ Error: Missing closing brace */
.container {
  display: flex;
  padding: 10px
/* Next rule starts without closing previous */
.item {
  margin: 5px;
}

/* ✅ Fixed */
.container {
  display: flex;
  padding: 10px;
}
.item {
  margin: 5px;
}
```

**Action Items**:
- [ ] AI: Run CSS syntax validator
- [ ] Human: Review flagged styles
- [ ] AI: Apply semicolon fixes
- [ ] Human: Verify no visual regressions

---

### Topic 6: Module Import Path Errors
**Error Count**: 27 instances
**Complexity**: ⭐⭐⭐ (High - path resolution)
**AI Role**: List broken imports
**Human Role**: Decide correct paths

**Patterns**:
```typescript
// ❌ Error: Module not found
import { Button } from '$lib/types/button.ts';  // Wrong path

// ❌ Error: Not a module
import cache from '$lib/services/loki-cache.ts';  // File doesn't export

// ✅ Fixed
import Button from '$lib/components/ui/Button.svelte';
import { cacheService } from '$lib/services/loki-cache.ts';
```

**Research Questions**:
1. Have files been moved or renamed?
2. Should we update tsconfig paths?
3. Can we automate import path updates?

**Action Items**:
- [ ] AI: Generate import error report with suggestions
- [ ] Human: Verify correct import paths
- [ ] AI: Bulk update imports
- [ ] Human: Test builds

---

## 📋 Priority 3: Low-Impact Research Topics (Nice to Have)

### Topic 7: Cannot Find Name Errors (Variables)
**Error Count**: 15+ instances
**Complexity**: ⭐⭐⭐⭐ (Very High - logic dependent)
**AI Role**: Flag missing declarations
**Human Role**: Determine correct scope and values

**Pattern**:
```typescript
// ❌ Error: Cannot find name 'streaming'
{#if streaming}
  <div>Loading...</div>
{/if}

// ✅ Fixed: Add declaration
let streaming = $state(false);
{#if streaming}
  <div>Loading...</div>
{/if}
```

**Why Human Critical**:
- Need to understand component logic
- Must determine correct initial values
- May require state management changes

**Action Items**:
- [ ] AI: List all "Cannot find name" errors
- [ ] Human: Review each component's data flow
- [ ] Human: Add proper declarations
- [ ] AI: Assist with Svelte 5 runes syntax

---

### Topic 8: Type Mismatches
**Error Count**: Variable
**Complexity**: ⭐⭐⭐⭐ (Very High - TypeScript expertise)
**AI Role**: Explain type errors
**Human Role**: Fix type definitions

**Examples**:
```typescript
// Property does not exist on type
// Type is not assignable to type
// Missing required properties
```

**Action Items**:
- [ ] AI: Generate type error report
- [ ] Human: Fix type definitions
- [ ] AI: Suggest type annotations
- [ ] Human: Validate type safety

---

## 🛠️ Collaborative Workflow

### Workflow A: AI-First Approach
**Best for**: Patterns, syntax, bulk operations

1. **AI**: Identify pattern and create fixer
2. **AI**: Run in dry-run mode, generate report
3. **Human**: Review changes, approve/reject
4. **AI**: Apply fixes
5. **Human**: Test and validate

**Use for**: Topics 1, 3, 5

---

### Workflow B: Human-First Approach
**Best for**: Logic, context, design decisions

1. **AI**: Generate error report with context
2. **Human**: Analyze and decide fix approach
3. **Human**: Make fixes or provide guidance
4. **AI**: Assist with implementation
5. **AI**: Run tests and validation

**Use for**: Topics 2, 4, 7, 8

---

### Workflow C: Hybrid Approach
**Best for**: Mixed complexity

1. **Human**: Classify errors by complexity
2. **AI**: Handle simple cases automatically
3. **Human**: Review and fix complex cases
4. **AI**: Bulk apply all approved fixes
5. **Both**: Test and iterate

**Use for**: Topic 6

---

## 📊 Effort vs Impact Matrix

```
High Impact │ Topic 3  │ Topic 1  │
            │ (commas) │ (quotes) │
            ├──────────┼──────────┤
            │ Topic 5  │ Topic 2  │
            │ (CSS)    │ (braces) │
────────────┼──────────┼──────────┤
Low Impact  │ Topic 8  │ Topic 4  │
            │ (types)  │ (blocks) │
            ├──────────┼──────────┤
            │          │ Topic 6  │
            │          │ (imports)│
            │          │ Topic 7  │
            │          │ (vars)   │
            └──────────┴──────────┘
          Low Effort → High Effort
```

**Recommended Order**:
1. Topic 3 (missing commas) - High impact, low effort
2. Topic 1 (mismatched quotes) - High impact, medium effort
3. Topic 5 (CSS braces) - Medium impact, medium effort
4. Topic 2 (unclosed expressions) - High impact, high effort
5. Topic 6 (imports) - Medium impact, high effort
6. Topic 4 (block tags) - Medium impact, very high effort
7. Topic 7 (variables) - Low impact, very high effort
8. Topic 8 (types) - Low impact, very high effort

---

## 🎯 Session Goals

### Short-term (1-2 Sessions)
- [ ] Complete Topics 1, 3, 5 (150-200 errors)
- [ ] Start Topic 2 (20 errors)
- **Target**: 787 → ~600 errors

### Medium-term (3-5 Sessions)
- [ ] Complete Topics 2, 6 (47 errors)
- [ ] Start Topic 4 (40 errors)
- **Target**: ~600 → ~400 errors

### Long-term (6-10 Sessions)
- [ ] Complete Topics 4, 7, 8 (100+ errors)
- [ ] Edge case cleanup
- **Target**: ~400 → <100 errors

---

## 📝 Research Templates

### Error Report Template

```markdown
## Error: [Description]

**File**: path/to/file.ts:line:col
**Pattern**: [Error pattern]
**Context**: [Surrounding code]
**Suggested Fix**: [Proposed solution]
**Risk Level**: Low/Medium/High
**Dependencies**: [Other files affected]
```

### Fix Proposal Template

```markdown
## Fix Proposal: [Topic]

**Errors Targeted**: [Count]
**Approach**: [Automated/Manual/Hybrid]
**Changes Preview**: [Code diff]
**Test Plan**: [How to verify]
**Rollback Plan**: [If something breaks]
```

---

## 🚨 Safety Guidelines

### Before Bulk Fixes
1. ✅ Create git branch
2. ✅ Run full test suite
3. ✅ Generate change preview
4. ✅ Human approval required

### During Fixes
1. ✅ Fix one topic at a time
2. ✅ Test after each batch
3. ✅ Commit incrementally
4. ✅ Document changes

### After Fixes
1. ✅ Run svelte-check
2. ✅ Run tsc
3. ✅ Run test suite
4. ✅ Manual smoke test

---

## 💡 Tips for Humans

1. **Start small**: Pick one topic, fix 5-10 errors, see results
2. **Use AI for patterns**: Let AI find all instances, you review
3. **Test frequently**: Don't wait until all fixes are done
4. **Document decisions**: Future you will thank present you
5. **Ask AI for explanations**: If unsure about an error, ask AI to explain
6. **Pair program**: Use AI as a pair programmer, not just a tool

---

## 💡 Tips for AI

1. **Provide context**: Don't just fix, explain why
2. **Generate previews**: Show changes before applying
3. **Track progress**: Update counts after each batch
4. **Suggest alternatives**: Multiple approaches when applicable
5. **Learn patterns**: Document new patterns discovered
6. **Admit limitations**: Flag errors that need human review

---

## 📚 Additional Resources

### Svelte 5 Migration Guides
- [ ] Review Svelte 5 runes documentation
- [ ] Check bits-ui v2 migration guide
- [ ] Study template syntax changes

### TypeScript Best Practices
- [ ] Review TypeScript 5.x handbook
- [ ] Check project tsconfig settings
- [ ] Study type inference improvements

### CSS & Styling
- [ ] Review UnoCSS documentation
- [ ] Check Tailwind v4 changes (if applicable)
- [ ] Study CSS-in-Svelte best practices

---

## ✅ Success Criteria

### Per Topic
- [ ] Error count reduced by target amount
- [ ] No new errors introduced
- [ ] Tests passing
- [ ] Code review completed

### Overall Session
- [ ] 787 → <600 errors (minimum)
- [ ] All fixes committed
- [ ] Documentation updated
- [ ] Research topics refined

---

**Next Steps**: Choose a topic, start with the workflow that fits, and make progress! 🚀

Remember: **Progress over perfection**. Fixing 50 errors with confidence is better than attempting 200 and introducing regressions.
