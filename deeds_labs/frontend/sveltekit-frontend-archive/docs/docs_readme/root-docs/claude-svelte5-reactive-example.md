# Comprehensive Svelte 5 Reactive Example: EnhancedCaseForm Migration

This document demonstrates a complete migration from legacy Svelte patterns to modern Svelte 5
reactive patterns, using a real-world legal case management form as an example.

## Migration Overview

### Legacy Patterns → Modern Svelte 5 Patterns

| Legacy Pattern              | Modern Svelte 5 Pattern                | Benefits                                 |
| --------------------------- | -------------------------------------- | ---------------------------------------- |
| `export let prop = default` | `let { prop = default } = $props()`    | Better TypeScript support, destructuring |
| `let reactive: Derived`     | `let reactive = $derived(computation)` | Clearer reactivity intent                |
| `$: reactive = computation` | `let reactive = $derived(computation)` | Explicit derived state                   |
| `let state = value`         | `let state = $state(value)`            | Explicit state tracking                  |
| Manual validation logic     | `$derived` validation                  | Automatic revalidation                   |
| Event dispatchers           | Modern event handling                  | Simplified event patterns                |

## Complete Migrated Component

```svelte
<!-- EnhancedCaseForm.svelte - Modern Svelte 5 Version -->
<script lang="ts">
  import { notifications } from '$lib/stores/notification';
  import type { User } from '$lib/types/user';
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Case } from '$lib/types/index';

  // ============================================================================
  // PROPS & BINDABLE STATE
  // ============================================================================

  interface Props {
    case_?: Case | null;
    user?: User;
    autoSave?: boolean;
    showAdvanced?: boolean;
  }

  let {
    case_ = $bindable(),
    user = $bindable(),
    autoSave = false,
    showAdvanced = true,
  } = $props<Props>();

  const dispatch = createEventDispatcher<{
    created: Case;
    updated: Case;
    deleted: Case;
    draft_saved: Partial<Case>;
  }>();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Form data state - explicitly tracked
  let formData = $state({
    title: case_?.title || '',
    description: case_?.description || '',
    caseNumber: case_?.caseNumber || '',
    name: case_?.name || '',
    incidentDate: case_?.incidentDate
      ? new Date(case_.incidentDate).toISOString().split('T')[0]
      : '',
    location: case_?.location || '',
    priority: case_?.priority || 'medium',
    status: case_?.status || 'open',
    category: case_?.category || '',
    dangerScore: case_?.dangerScore || 0,
    estimatedValue: case_?.estimatedValue || '',
    jurisdiction: case_?.jurisdiction || '',
    leadProsecutor: case_?.leadProsecutor || user?.id || '',
    assignedTeam: case_?.assignedTeam || [],
    tags: case_?.tags || [],
    metadata: case_?.metadata || {},
  });

  // UI state
  let loading = $state(false);
  let showValidation = $state(false);
  let isDirty = $state(false);
  let lastSaved = $state<Date | null>(null);

  // ============================================================================
  // DERIVED STATE & REACTIVE COMPUTATIONS
  // ============================================================================

  // Form validation - automatically recomputes when formData changes
  let validationErrors = $derived(() => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Title is required';
    }

    if (!formData.caseNumber.trim()) {
      errors.caseNumber = 'Case number is required';
    }

    if (formData.dangerScore < 0 || formData.dangerScore > 10) {
      errors.dangerScore = 'Danger score must be between 0 and 10';
    }

    if (formData.estimatedValue && isNaN(Number(formData.estimatedValue))) {
      errors.estimatedValue = 'Estimated value must be a number';
    }

    if (formData.incidentDate) {
      const incidentDate = new Date(formData.incidentDate);
      const today = new Date();
      if (incidentDate > today) {
        errors.incidentDate = 'Incident date cannot be in the future';
      }
    }

    return errors;
  });

  // Validation state
  let isValid = $derived(Object.keys(validationErrors).length === 0);
  let hasErrors = $derived(showValidation && !isValid);

  // Form state computations
  let canSubmit = $derived(isValid && !loading && isDirty);
  let canSaveDraft = $derived(isDirty && !loading);
  let isEditing = $derived(!!case_);

  // Progress and status indicators
  let completionPercentage = $derived(() => {
    const requiredFields = ['title', 'caseNumber', 'description'];
    const optionalFields = ['location', 'category', 'jurisdiction'];
    const allFields = [...requiredFields, ...optionalFields];

    const filledFields = allFields.filter(
      (field) =>
        formData[field as keyof typeof formData] &&
        String(formData[field as keyof typeof formData]).trim()
    );

    return Math.round((filledFields.length / allFields.length) * 100);
  });

  let statusBadgeVariant = $derived(() => {
    switch (formData.status) {
      case 'open':
        return 'default';
      case 'active':
        return 'secondary';
      case 'closed':
        return 'success';
      case 'suspended':
        return 'warning';
      default:
        return 'outline';
    }
  });

  let priorityBadgeVariant = $derived(() => {
    switch (formData.priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'warning';
      case 'medium':
        return 'secondary';
      case 'low':
        return 'outline';
      default:
        return 'outline';
    }
  });

  // Auto-save trigger - derived from isDirty state
  let shouldAutoSave = $derived(autoSave && isDirty && isValid && !loading);

  // Data preparation for API - automatically updates when formData changes
  let apiPayload = $derived(() => ({
    title: formData.title.trim(),
    description: formData.description.trim(),
    caseNumber: formData.caseNumber.trim(),
    name: formData.name.trim() || formData.title.trim(),
    incidentDate: formData.incidentDate || null,
    location: formData.location.trim(),
    priority: formData.priority,
    status: formData.status,
    category: formData.category.trim(),
    dangerScore: Number(formData.dangerScore),
    estimatedValue: formData.estimatedValue ? Number(formData.estimatedValue) : null,
    jurisdiction: formData.jurisdiction.trim(),
    leadProsecutor: formData.leadProsecutor || user?.id,
    assignedTeam: formData.assignedTeam,
    tags: formData.tags,
    metadata: {
      ...formData.metadata,
      formVersion: '2.0',
      lastModified: new Date().toISOString(),
      completionPercentage,
    },
  }));

  // ============================================================================
  // REACTIVE EFFECTS & SIDE EFFECTS
  // ============================================================================

  // Track form changes for dirty state
  $effect(() => {
    // This runs whenever formData changes
    if (case_) {
      const hasChanges =
        JSON.stringify(formData) !==
        JSON.stringify({
          title: case_.title || '',
          description: case_.description || '',
          caseNumber: case_.caseNumber || '',
          name: case_.name || '',
          incidentDate: case_.incidentDate
            ? new Date(case_.incidentDate).toISOString().split('T')[0]
            : '',
          location: case_.location || '',
          priority: case_.priority || 'medium',
          status: case_.status || 'open',
          category: case_.category || '',
          dangerScore: case_.dangerScore || 0,
          estimatedValue: case_.estimatedValue || '',
          jurisdiction: case_.jurisdiction || '',
          leadProsecutor: case_.leadProsecutor || user?.id || '',
          assignedTeam: case_.assignedTeam || [],
          tags: case_.tags || [],
          metadata: case_.metadata || {},
        });
      isDirty = hasChanges;
    } else {
      // New case - dirty if any required fields are filled
      isDirty = !!(formData.title || formData.caseNumber || formData.description);
    }
  });

  // Auto-save effect
  $effect(() => {
    if (shouldAutoSave) {
      const timeoutId = setTimeout(() => {
        saveDraft();
      }, 2000); // Debounce auto-save by 2 seconds

      return () => clearTimeout(timeoutId);
    }
  });

  // Validation display effect
  $effect(() => {
    // Show validation errors after user starts interacting
    if (isDirty && !showValidation) {
      showValidation = true;
    }
  });

  // ============================================================================
  // EVENT HANDLERS & ACTIONS
  // ============================================================================

  async function handleSubmit() {
    showValidation = true;

    if (!isValid) {
      notifications.add({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fix the form errors before submitting.',
      });
      return;
    }

    loading = true;

    try {
      const url = case_ ? `/api/cases/${case_.id}` : '/api/cases';
      const method = case_ ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to save case');
      }

      const savedCase = await response.json();

      notifications.add({
        type: 'success',
        title: case_ ? 'Case Updated' : 'Case Created',
        message: `Case "${savedCase.title}" has been ${case_ ? 'updated' : 'created'} successfully.`,
      });

      lastSaved = new Date();
      isDirty = false;
      dispatch(case_ ? 'updated' : 'created', savedCase);
    } catch (error) {
      console.error('Error saving case:', error);
      notifications.add({
        type: 'error',
        title: 'Save Error',
        message: error instanceof Error ? error.message : 'Failed to save case. Please try again.',
      });
    } finally {
      loading = false;
    }
  }

  async function saveDraft() {
    if (!canSaveDraft) return;

    try {
      // Save to localStorage as backup
      localStorage.setItem(`case-draft-${case_?.id || 'new'}`, JSON.stringify(apiPayload));

      lastSaved = new Date();
      dispatch('draft_saved', apiPayload);

      notifications.add({
        type: 'info',
        title: 'Draft Saved',
        message: 'Your changes have been saved as a draft.',
      });
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }

  function loadDraft() {
    if (case_?.id) return; // Don't load draft for existing cases

    try {
      const draftData = localStorage.getItem('case-draft-new');
      if (draftData) {
        const draft = JSON.parse(draftData);
        Object.assign(formData, draft);
        isDirty = true;
      }
    } catch (error) {
      console.error('Error loading draft:', error);
    }
  }

  function resetForm() {
    if (case_) {
      // Reset to original case data
      Object.assign(formData, {
        title: case_.title || '',
        description: case_.description || '',
        caseNumber: case_.caseNumber || '',
        // ... etc
      });
    } else {
      // Reset to empty form
      Object.assign(formData, {
        title: '',
        description: '',
        caseNumber: '',
        name: '',
        incidentDate: '',
        location: '',
        priority: 'medium',
        status: 'open',
        category: '',
        dangerScore: 0,
        estimatedValue: '',
        jurisdiction: '',
        leadProsecutor: user?.id || '',
        assignedTeam: [],
        tags: [],
        metadata: {},
      });
    }
    isDirty = false;
    showValidation = false;
  }

  // Tag management with reactive updates
  function addTag(tag: string) {
    if (tag && !formData.tags.includes(tag)) {
      formData.tags = [...formData.tags, tag];
    }
  }

  function removeTag(tag: string) {
    formData.tags = formData.tags.filter((t) => t !== tag);
  }

  // Team management with reactive updates
  function addTeamMember(member: string) {
    if (member && !formData.assignedTeam.includes(member)) {
      formData.assignedTeam = [...formData.assignedTeam, member];
    }
  }

  function removeTeamMember(member: string) {
    formData.assignedTeam = formData.assignedTeam.filter((m) => m !== member);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMount(() => {
    loadDraft();
  });
</script>

<!-- ============================================================================ -->
<!-- TEMPLATE -->
<!-- ============================================================================ -->

<div class="enhanced-case-form">
  <!-- Form Header with Status -->
  <div class="form-header">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">
          {isEditing ? 'Edit Case' : 'Create New Case'}
        </h2>
        <p class="text-muted-foreground">
          {isEditing
            ? `Editing case: ${case_?.caseNumber}`
            : 'Fill out the form to create a new case'}
        </p>
      </div>

      <div class="flex items-center gap-4">
        <!-- Completion Progress -->
        <div class="text-sm">
          <span class="text-muted-foreground">Progress:</span>
          <span class="font-medium">{completionPercentage}%</span>
        </div>

        <!-- Status Badges -->
        <Badge variant={statusBadgeVariant}>
          {formData.status}
        </Badge>

        <Badge variant={priorityBadgeVariant}>
          {formData.priority}
        </Badge>

        <!-- Auto-save indicator -->
        {#if autoSave && lastSaved}
          <span class="text-xs text-muted-foreground">
            Last saved: {lastSaved.toLocaleTimeString()}
          </span>
        {/if}
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mt-4">
      <div class="w-full bg-secondary rounded-full h-2">
        <div
          class="bg-primary rounded-full h-2 transition-all duration-300"
          style="width: {completionPercentage}%"
        ></div>
      </div>
    </div>
  </div>

  <!-- Main Form -->
  <form onsubmit|preventDefault={handleSubmit} class="space-y-8">
    <!-- Basic Information Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <FileText size={20} />
          Basic Information
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Title -->
          <div class="space-y-2">
            <Label for="title">Case Title *</Label>
            <Input
              id="title"
              bind:value={formData.title}
              placeholder="Enter case title"
              class:border-destructive={hasErrors && validationErrors.title}
              required
            />
            {#if hasErrors && validationErrors.title}
              <p class="text-sm text-destructive">{validationErrors.title}</p>
            {/if}
          </div>

          <!-- Case Number -->
          <div class="space-y-2">
            <Label for="caseNumber">Case Number *</Label>
            <Input
              id="caseNumber"
              bind:value={formData.caseNumber}
              placeholder="e.g., CASE-2024-001"
              class:border-destructive={hasErrors && validationErrors.caseNumber}
              required
            />
            {#if hasErrors && validationErrors.caseNumber}
              <p class="text-sm text-destructive">{validationErrors.caseNumber}</p>
            {/if}
          </div>
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <Label for="description">Description</Label>
          <Textarea
            id="description"
            bind:value={formData.description}
            placeholder="Detailed case description"
            rows={4}
          />
        </div>

        <!-- Location and Incident Date -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="location">Location</Label>
            <Input id="location" bind:value={formData.location} placeholder="Incident location" />
          </div>

          <div class="space-y-2">
            <Label for="incidentDate">Incident Date</Label>
            <Input
              id="incidentDate"
              type="date"
              bind:value={formData.incidentDate}
              class:border-destructive={hasErrors && validationErrors.incidentDate}
            />
            {#if hasErrors && validationErrors.incidentDate}
              <p class="text-sm text-destructive">{validationErrors.incidentDate}</p>
            {/if}
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Case Management Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Settings size={20} />
          Case Management
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Priority -->
          <div class="space-y-2">
            <Label for="priority">Priority</Label>
            <Select bind:value={formData.priority}>
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Status -->
          <div class="space-y-2">
            <Label for="status">Status</Label>
            <Select bind:value={formData.status}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- Category -->
          <div class="space-y-2">
            <Label for="category">Category</Label>
            <Input id="category" bind:value={formData.category} placeholder="Case category" />
          </div>
        </div>

        <!-- Danger Score and Estimated Value -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="dangerScore">Danger Score (0-10)</Label>
            <Input
              id="dangerScore"
              type="number"
              min="0"
              max="10"
              bind:value={formData.dangerScore}
              class:border-destructive={hasErrors && validationErrors.dangerScore}
            />
            {#if hasErrors && validationErrors.dangerScore}
              <p class="text-sm text-destructive">{validationErrors.dangerScore}</p>
            {/if}
          </div>

          <div class="space-y-2">
            <Label for="estimatedValue">Estimated Value ($)</Label>
            <Input
              id="estimatedValue"
              type="number"
              bind:value={formData.estimatedValue}
              placeholder="0.00"
              class:border-destructive={hasErrors && validationErrors.estimatedValue}
            />
            {#if hasErrors && validationErrors.estimatedValue}
              <p class="text-sm text-destructive">{validationErrors.estimatedValue}</p>
            {/if}
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Tags Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Tag size={20} />
          Tags
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Tag Input -->
          <div class="flex gap-2">
            <Input
              placeholder="Add tag..."
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const input = e.currentTarget;
                  addTag(input.value.trim());
                  input.value = '';
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              onclick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                addTag(input.value.trim());
                input.value = '';
              }}
            >
              Add
            </Button>
          </div>

          <!-- Tag Display -->
          {#if formData.tags.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each formData.tags as tag}
                <Badge variant="secondary" class="flex items-center gap-1">
                  {tag}
                  <button
                    type="button"
                    onclick={() => removeTag(tag)}
                    class="ml-1 hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              {/each}
            </div>
          {/if}
        </div>
      </CardContent>
    </Card>

    <!-- Form Actions -->
    <div class="flex justify-between items-center pt-6 border-t">
      <div class="flex items-center gap-4">
        {#if isDirty}
          <Badge variant="outline" class="text-xs">Unsaved changes</Badge>
        {/if}

        {#if autoSave}
          <span class="text-xs text-muted-foreground"> Auto-save enabled </span>
        {/if}
      </div>

      <div class="flex gap-3">
        {#if canSaveDraft}
          <Button type="button" variant="outline" onclick={saveDraft} disabled={loading}>
            Save Draft
          </Button>
        {/if}

        <Button type="button" variant="ghost" onclick={resetForm} disabled={loading}>Reset</Button>

        <Button type="submit" disabled={!canSubmit}>
          {#if loading}
            <Loader2 class="mr-2 animate-spin" size={16} />
            {isEditing ? 'Updating...' : 'Creating...'}
          {:else}
            {isEditing ? 'Update Case' : 'Create Case'}
          {/if}
        </Button>
      </div>
    </div>
  </form>
</div>

<style>
  .enhanced-case-form {
    @apply max-w-4xl mx-auto p-6 space-y-6;
  }

  .form-header {
    @apply mb-8 p-6 bg-card rounded-lg border;
  }
</style>
```

## Key Migration Benefits

### 1. **Explicit State Management**

```typescript
// Before (implicit)
let formData = { ... };

// After (explicit)
let formData = $state({ ... });
```

### 2. **Reactive Validation**

```typescript
// Before (manual)
function validateForm() { ... }

// After (automatic)
let validationErrors = $derived(() => { ... });
let isValid = $derived(Object.keys(validationErrors).length === 0);
```

### 3. **Auto-computed Properties**

```typescript
// Before (manual updates)
let completionPercentage = 0;
// Update manually in multiple places

// After (automatic)
let completionPercentage = $derived(() => {
  // Automatically recalculates when formData changes
});
```

### 4. **Cleaner Side Effects**

```typescript
// Before (lifecycle hooks)
$: if (shouldAutoSave) { ... }

// After (explicit effects)
$effect(() => {
  if (shouldAutoSave) {
    // Clean side effect management
  }
});
```

### 5. **Better TypeScript Integration**

```typescript
// Before (weak typing)
export let case_: Case | null = null;

// After (strong typing)
let { case_ = $bindable() } = $props<{ case_?: Case | null }>();
```

## Performance Benefits

1. **Granular Updates**: Only affected parts re-render
2. **Automatic Dependency Tracking**: No manual dependency arrays
3. **Efficient Validation**: Only runs when relevant data changes
4. **Optimized Effects**: Better cleanup and memory management

## Developer Experience Benefits

1. **Type Safety**: Full TypeScript support throughout
2. **Clearer Intent**: Explicit state vs derived vs effects
3. **Better Debugging**: Clear reactive dependency chains
4. **Reduced Boilerplate**: Less manual state management

This migration example shows how modern Svelte 5 patterns create more maintainable, performant, and
developer-friendly components while preserving all functionality.
