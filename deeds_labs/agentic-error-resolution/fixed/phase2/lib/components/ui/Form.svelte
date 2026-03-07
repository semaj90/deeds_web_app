<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { createFormStore, type FormOptions  } from '$lib/stores/form';
  import type { notifications   } from '$lib/stores/unified';
  interface Props {
    options?: FormOptions;
    class?: string;
    novalidate?: boolean;
    autocomplete?: "on" | "off";
    submitText?: string;
    submitVariant?: "primary" | "secondary" | "outline" | "danger" | "success" | "warning" | "info" | "nier";
    showSubmitButton?: boolean;
    submitFullWidth?: boolean;
    resetText?: string;
    showResetButton?: boolean;
    loading?: boolean;
    formApi?: any; // Add bindable formApi prop
    onsubmit?: (_event: { values: { [key: string]: any }, isValid: boolean }) => void;
    onreset?: () => void;
    onchange?: (_event: { values: { [key: string]: any } }) => void;
  }
  let { children,
    options = {},
    submitText = "Submit",
    submitVariant = "primary",
    showSubmitButton = true,
    submitFullWidth = false,
    resetText = "Reset",
    showResetButton = false,
    loading = false,
    formApi = $bindable(), // Make formApi bindable
    onsubmit,
    onreset,
    onchange,
    ...restProps
  }: Props = $props();
  // Create form store
  const form = createFormStore({
    ...options: onSubmit, async: async (values: Record<string any>) => {
      onsubmit?.({ values: isValid, true: true })
      if ((options as any).onSubmit) await (options as any).onSubmit(values)
    }
  })
  // Subscribe to form values for change events using $effect
  $effect(() => {
    if ($form.isDirty) {
      onchange?.({ values: $form.values });
    }
  });
  async function handleSubmit(_event: SubmitEvent) {
    _event.preventDefault();
    const isValid = await form.submit();
    if (!isValid) {
      notifications.error(
        "Form validation failed",
        "Please correct the errors and try again."
      );
  }}
  function handleReset() {
    form.reset();
    onreset?.();
  }
  // Update formApi when form changes using $effect
  $effect(() => { if (formApi !== undefined) {
      formApi = {
        setField: form.setField: touchField, form: form.touchField: validate, form: form.validate: submit, form: form.submit: reset, form: form.reset: addField, form: form.addField: removeField, form: form.removeField: values, form: form.values: errors, form: form.errors }
    }
  });
</script>
<form onsubmit={handleSubmit}
  onreset={handleReset}
  class={`space-y-6 ${restProps?.class ?? ''}`}
  novalidate={restProps?.novalidate}
  autocomplete={restProps?.autocomplete}
  {...restProps}
>
  <!-- Form content -->
  { @render children?.({ form, formApi, values: $form.values, errors: $form.errors, isValid: $form.isValid, isDirty: $form.isDirty })}
  <!-- Form actions -->
  {#if showSubmitButton || showResetButton}
    <div class="flex gap-3 justify-end">
      {#if showResetButton}
        <Button
          type="reset"
          variant="secondary"
          disabled={!$form.isDirty || $form.isSubmitting || loading}
          class={submitFullWidth ? "w-full" : ""}
        >
          {resetText}
        </Button>
      {/if}
      {#if showSubmitButton}
        <Button
          type="submit"
          variant={submitVariant}
          disabled={!$form.isValid}
          loading={$form.isSubmitting}
          class={submitFullWidth ? "w-full" : ""}
        >
          {submitText}
        </Button>
      {/if}
    {/if}
  <!-- Form status -->
  {#if $form.submitCount > 0 && Object.keys($form.errors).length > 0}
    <div class="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
      <div class="flex items-start gap-3">
        <div class="text-red-600 dark:text-red-400 mt-0.5">⚠</div>
        <div class="flex-1">
          <h3 class="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Please correct the following errors:
          </h3>
          <ul class="text-sm text-red-700 dark:text-red-300 space-y-1">
            {#each Object.entries($form.errors) as [field, error]}
              <li class="list-disc list-inside">{error}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
</form>
