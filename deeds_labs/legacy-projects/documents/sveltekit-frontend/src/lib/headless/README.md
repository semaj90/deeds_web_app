# Headless UI Primitives

Unstyled, accessible building blocks extracted from feature pages. See N64-UI-HOWTO.

## Components
- HeadlessDialog.svelte – focus trap, escape handling, backdrop close, optional controlled open.
- LoadingButton.svelte – shows spinner + disables to prevent duplicate submits.
- FormField.svelte – wires aria-invalid, error id, and first error message.

## Usage Example
```svelte
<script>
  import HeadlessDialog from '$lib/headless/HeadlessDialog.svelte';
  import LoadingButton from '$lib/headless/LoadingButton.svelte';
  import FormField from '$lib/headless/FormField.svelte';
  let open = false;
  let loading = false;
  let form = { title: '', errors: { title: ['Title required'] } };
</script>

<button on:click={() => open = true}>Open</button>
<HeadlessDialog bind:open={open}>
  <h2 slot="title" id="dialog-title" class="text-lg font-semibold">Create Item</h2>
  <form on:submit|preventDefault={() => { loading = true; setTimeout(()=> loading=false, 1000); }}>
    <FormField name="title" errors={form.errors.title}>
      <input slot="control" bind:value={form.title} id="title" name="title" class="border p-2 w-full" />
    </FormField>
    <div slot="footer" class="mt-4 flex justify-end gap-2">
      <button type="button" on:click={() => open=false}>Cancel</button>
      <LoadingButton type="submit" loading={loading} class="px-3 py-2 bg-blue-600 text-white rounded">Create</LoadingButton>
    </div>
  </form>
</HeadlessDialog>
```

## Notes
- These are intentionally minimal; styling stays in consumer.
- Extend where patterns recur (SelectHeadless, OptimisticList planned).
