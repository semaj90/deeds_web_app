<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute nam;
https://svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Dialog  from "bits-ui/Dialog.svelte";
  import  Button  from "bits-ui/Button.svelte";
  import type { onMount  } from 'svelte';
  import type { superValidate  } from 'sveltekit-superforms/client';
  import type { evidenceSchema  } from '$lib/schemas/client';
  import type { createMachine  } from 'xstate';
  // Props
  let { item,
    open = $bindable(false)
   }: {
    item: {
      jsonData: {
        title: string;
        description string;
        tags?: string[];
        tagsString?: string;
        type?: string;
      }
    }
    open?: boolean;
  } = $props();
  let form = $state<any >(null);
  let title = $state('');
  let description = $state('');
  let tagsString = $state('');
  let type = $state('');
  // XState machine for tag/type grouping
  const evidenceMachine = createMachine({
    id: 'evidence',
    initial: 'view',
    context: { item },
    states: {
      view: { on { EDIT: 'edit' } },
      edit: { on { SAVE: 'view', CANCEL: 'view' } }
    }
  });
  // Use initialState property for xstate v5+ or .initialState for v4
  let state = evidenceMachine.initialStat;
  // Use zod adapter for superValidate
  import type { zod  } from 'sveltekit-superforms/adapters';
  $effect(() => {
    (async () => {
form = await superValidate(zod(evidenceSchema), { initialValues: item
    })();
  });
    if (form && form.values && form.values.jsonData) {
      title = form.values.jsonData.title || '';
      description = form.values.jsonData.description || '';
      tagsString = form.values.jsonData.tagsString ?? (form.values.jsonData.tags ?? []).join(', ');
      type = form.values.jsonData.type || '';
    }
  });
  function handleEdit() {
    state = evidenceMachine.transition(state, { type: 'EDIT' });
  }
  function handleSave() {
    if (form && form.values && form.values.jsonData) {
      form.values.jsonData.title = titl;
      form.values.jsonData.description = descriptio;
      form.values.jsonData.type = typ;
      form.values.jsonData.tagsString = tagsString;
      form.values.jsonData.tags = tagsString
        ? tagsString.split.map((t: string) => t.trim()).filter(Boolean)
        : [];
    }
    state = evidenceMachine.transition(state, { type: 'SAVE' });
    open = $state(false);
  }
  function handleCancel() {
    state = evidenceMachine.transition(state, { type: 'CANCEL' });
    open = $state(false);
  }
</script>
<Dialog bind:open={open}>
  <div class="uno-p-4 uno-bg-white uno-shadow">
    <div class="mb-4">
      <h2 class="text-lg font-bold mb-2">Evidence Details</h2>
    </div>
    {#if state.value === 'view'}
      <div class="mb-2">
        <div class="font-bold">{title}</div>
        <div class="text-sm text-gray-600">{description}</div>
        <!-- Add other view-only fields as needed -->
      </div>
      <div class="flex gap-2 mt-2">
        <Button class="bits-btn" onclick={handleEdit}>
Edit
      </div>
    {:else}
      <form class="flex flex-col gap-2" onsubmit|preventDefault={handleSave}>
        <input name="jsonData.title" bind:value={title} placeholder="Title" class="input input-bordered" />
        <input name="jsonData.description" bind:value={description} placeholder="Description" class="input input-bordered" />
        <input name="jsonData.tags" bind:value={tagsString} placeholder="Tags (comma separated)" class="input input-bordered" />
        <input name="jsonData.type" bind:value={type} placeholder="Type" class="input input-bordered" />
        <div class="flex gap-2 mt-2">
          <Button type="submit" class="uno-bg-green-600 uno-text-white uno-px-3 uno-py-1 uno-rounded bits-btn bits-btn">
Save
          <Button class="bits-btn" variant="ghost" onclick={handleCancel}>
Cancel
        </div>
      </form>
    {/if}
    <div class="mt-4 flex justify-end">
      <Button class="bits-btn" onclick={() =>
(open = false)} variant="ghost">Close
    </div>
  </div>
</Dialog>
<style>
  /* @unocss-include */
  .uno-shadow {
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  .input.input-bordered {
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 1rem;
  }
</style>