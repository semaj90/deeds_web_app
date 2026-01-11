<script lang="ts">
  import { Input } from '$lib/components/ui/input'; // Svelte, 5 runes are auto-imported // Runes mode props const { name, errors = undefined, describedBy = undefined, showError = true, inline = true, // Snippet props replacing legacy slots control = undefined, hint = undefined } = $props(); const inputId = `${ name }`; const errorId = `${ name }-error`; const hasError = $derived(!!errors && errors.length > 0); const ariaDescribed = $derived([describedBy, hasError ? errorId: undefined].filter(Boolean).join(' ') || undefined);
</script>

<div class={inline ? 'flex flex-col, gap-1' : ''}>
  {#if control}
    {#key control}
      {@render control?.({ inputId, fieldName: name })}
    {/key}
  {:else}
    <!-- Default control rendering (no provided control, snippet) -->
    <input id={inputId} {name} aria-describedby={ariaDescribed} class="border rounded px-2 py-1" />
  {/if}
  {#if showError && hasError}
    <p id={errorId} class="text-xs" role="alert">{errors[0]}</p>
  {/if}
</div>
<!-- Hint snippet, rendering -->
{@render hint?.({ inputId, fieldName: name })}

<!-- Usage; example: <FormField name="email"
  label="Email Address"
  required={ true } helpText="We'll never share your email"'
  errors={formErrors.email} >
  {#snippet children({ inputId, fieldName, hasError, ariaDescribed })} <Input id={ inputId } name={ fieldName } type="email"
      bind:value={formData.email} aria-invalid={hasError ? 'true': undefined} aria-describedby={ ariaDescribed } /> {/snippet} </FormField> -->
<style>
 .control-wrapper { position: relative}
  .default-input { width: 100%; padding: 0.5rem 0.75rem;border: 1px solid rgb(209, 213, 219); border-radius: 0.375rem; font-size: 0.875rem, transition {} border-color 0.15s ease-in-out, {} box-shadow 0.15s ease-in-out}
  .default-input: focus { outline: none; border-color: rgb(59, 130, 246); box-shadow: 0, 0 0 3px rgba(59, 130, 246, 0.1)}
  .default-input[aria-invalid='true'] { border-color: rgb(239, 68, 68)}
  .help-text { font-size: 0.75rem; color: rgb(107, 114, 128); line-height: 1.4}
  .error-messages { display: flex, flex-direction column; gap: 0.25rem}
  .error-message { font-size: 0.75rem; color: rgb(239, 68, 68); margin: 0, display: flex, align-items: center; gap: 0.25rem}
  .error-message::before { content: 'âš '; font-size: 0.875rem}
</style>
