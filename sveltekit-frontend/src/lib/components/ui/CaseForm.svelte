<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();

  // Form state
  let title = $state('');
  let description = $state('');
  let priority = $state('medium');
  let assignedTo = $state('');
  let dueDate = $state('');
  let tags = $state('');
  let isSubmitting = $state(false);
  let errors = $state<Record<string, string>>({});

  // Validation
  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!title.trim() || title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    if (title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters';
    }
    if (!description.trim() || description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) {
      newErrors.priority = 'Please select a valid priority';
    }
    if (dueDate && new Date(dueDate) < new Date()) {
      newErrors.dueDate = 'Due date cannot be in the past';
    }

    errors = newErrors;
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    isSubmitting = true;

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priority,
          assignedTo: assignedTo.trim() || null,
          dueDate: dueDate || null,
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        })
      });

      if (response.ok) {
        const newCase = await response.json();
        goto(`/cases/${newCase.id}`);
      } else {
        const err = await response.json();
        errors = { submit: err.message || 'Failed to create case' };
      }
    } catch (err) {
      console.error('Case creation error:', err);
      errors = { submit: 'Network error. Please check your connection.' };
    } finally {
      isSubmitting = false;
    }
  }

  function handleReset() {
    title = '';
    description = '';
    priority = 'medium';
    assignedTo = '';
    dueDate = '';
    tags = '';
    errors = {};
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'r') {
        e.preventDefault();
        handleReset();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="container mx-auto max-w-3xl p-6 {className}">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-2">Create New Case</h1>
    <p class="text-gray-600">
      Fill out the form below to create a new legal case. All required fields must be completed.
    </p>
    <p class="text-sm text-gray-500 mt-2">
      Tip: Use <kbd class="px-1.5 py-0.5 bg-gray-100 border rounded text-xs font-mono">Ctrl+S</kbd> to save,
      <kbd class="px-1.5 py-0.5 bg-gray-100 border rounded text-xs font-mono">Ctrl+R</kbd> to reset
    </p>
  </div>

  {#if errors.submit}
    <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      {errors.submit}
    </div>
  {/if}

  <form
    onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
    class="space-y-6"
  >
    <!-- Basic Information -->
    <fieldset class="space-y-4">
      <legend class="text-lg font-semibold text-gray-800 mb-2">Basic Information</legend>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-1">
          <label for="case-title" class="block text-sm font-medium text-gray-700">
            Case Title <span class="text-red-500">*</span>
          </label>
          <input
            id="case-title"
            type="text"
            bind:value={title}
            placeholder="Enter a descriptive title for the case"
            class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            class:border-red-300={errors.title}
          />
          {#if errors.title}
            <p class="text-sm text-red-500">{errors.title}</p>
          {/if}
        </div>

        <div class="space-y-1">
          <label for="case-priority" class="block text-sm font-medium text-gray-700">
            Priority <span class="text-red-500">*</span>
          </label>
          <select
            id="case-priority"
            bind:value={priority}
            class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div class="space-y-1">
        <label for="case-description" class="block text-sm font-medium text-gray-700">
          Description <span class="text-red-500">*</span>
        </label>
        <textarea
          id="case-description"
          bind:value={description}
          rows={4}
          placeholder="Provide a detailed description of the case"
          class="w-full px-3 py-2 border rounded-md bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-red-300={errors.description}
        ></textarea>
        {#if errors.description}
          <p class="text-sm text-red-500">{errors.description}</p>
        {/if}
      </div>

      <div class="space-y-1">
        <label for="case-due-date" class="block text-sm font-medium text-gray-700">Due Date</label>
        <input
          id="case-due-date"
          type="date"
          bind:value={dueDate}
          class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:border-red-300={errors.dueDate}
        />
        {#if errors.dueDate}
          <p class="text-sm text-red-500">{errors.dueDate}</p>
        {/if}
      </div>
    </fieldset>

    <!-- Assignment & Tags -->
    <fieldset class="space-y-4">
      <legend class="text-lg font-semibold text-gray-800 mb-2">Assignment & Tags</legend>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-1">
          <label for="case-assigned" class="block text-sm font-medium text-gray-700">Assigned To</label>
          <input
            id="case-assigned"
            type="text"
            bind:value={assignedTo}
            placeholder="Enter assignee email or name"
            class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="space-y-1">
          <label for="case-tags" class="block text-sm font-medium text-gray-700">Tags</label>
          <input
            id="case-tags"
            type="text"
            bind:value={tags}
            placeholder="Enter tags separated by commas"
            class="w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </fieldset>

    <!-- Actions -->
    <div class="flex items-center justify-between pt-4 border-t">
      <button
        type="button"
        onclick={handleReset}
        class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        Reset Form
      </button>

      <button
        type="submit"
        disabled={isSubmitting}
        class="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Creating...' : 'Create Case'}
      </button>
    </div>
  </form>
</div>

<style>
  kbd {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
  }
</style>
