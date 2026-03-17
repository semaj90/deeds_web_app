<script lang="ts">
  import superForm from 'sveltekit-superforms';
  import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';

  const poiSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    aliases: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['surveillance', 'wanted', 'active', 'cleared']),
    threatLevel: z.enum(['low', 'medium', 'high', 'critical']),
    relationship: z.string().optional(),
    crimes: z.string().optional()
  });

  interface Props {
    formData: any;
  }

  let { formData }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(formData, {
    validators: zodClient(poiSchema),
    resetForm: false
  });

  const statusOptions = [
    { value: 'surveillance', label: 'Surveillance' },
    { value: 'wanted', label: 'Wanted' },
    { value: 'active', label: 'Active' },
    { value: 'cleared', label: 'Cleared' }
  ];

  const threatLevelOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ];
</script>

<form method="POST" use:enhance class="poi-form">
  <div class="form-group">
    <label for="name">Name *</label>
    <input
      id="name"
      type="text"
      name="name"
      bind:value={$form.name}
      placeholder="Full name"
      class:error={$errors.name}
    />
    {#if $errors.name}
      <span class="error-message">{$errors.name}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="aliases">Aliases</label>
    <input
      id="aliases"
      type="text"
      name="aliases"
      bind:value={$form.aliases}
      placeholder="Comma-separated aliases"
    />
  </div>

  <div class="form-group">
    <label for="relationship">Relationship / Other Context</label>
    <input
      id="relationship"
      type="text"
      name="relationship"
      bind:value={$form.relationship}
      placeholder="Witness, associate, other context"
      class:error={$errors.relationship}
    />
    {#if $errors.relationship}
      <span class="error-message">{$errors.relationship}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="status">Status *</label>
    <select
      id="status"
      name="status"
      bind:value={$form.status}
      class:error={$errors.status}
    >
      <option value="">Select status</option>
      {#each statusOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    {#if $errors.status}
      <span class="error-message">{$errors.status}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="threatLevel">Threat Level *</label>
    <select
      id="threatLevel"
      name="threatLevel"
      bind:value={$form.threatLevel}
      class:error={$errors.threatLevel}
    >
      <option value="">Select threat level</option>
      {#each threatLevelOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    {#if $errors.threatLevel}
      <span class="error-message">{$errors.threatLevel}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="crimes">Crimes / Charges</label>
    <textarea
      id="crimes"
      name="crimes"
      bind:value={$form.crimes}
      placeholder="Comma-separated, e.g. Fraud, Assault, Theft"
      rows="3"
      class:error={$errors.crimes}
    ></textarea>
    {#if $errors.crimes}
      <span class="error-message">{$errors.crimes}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="description">Description</label>
    <textarea
      id="description"
      name="description"
      bind:value={$form.description}
      placeholder="Physical description, notes, or other details"
      rows="3"
    ></textarea>
  </div>

  <div class="form-actions">
    <button type="submit" disabled={$submitting} class="btn-primary">
      {$submitting ? 'Saving...' : 'Save POI'}
    </button>
  </div>
</form>

<style>
  .poi-form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    padding: 1.5rem;
    background: #0f0f23;
    border: 1px solid #dc2626;
    border-radius: 0.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-weight: 600;
    color: #ffffff;
    font-size: 0.875rem;
  }

  input,
  select,
  textarea {
    padding: 0.75rem;
    background: #1a1a2e;
    border: 1px solid #333;
    border-radius: 0.375rem;
    color: #ffffff;
    font-family: inherit;
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  input.error,
  select.error,
  textarea.error {
    border-color: #ef4444;
  }

  .error-message {
    color: #ef4444;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .form-actions {
    grid-column: 1 / -1;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .btn-primary {
    padding: 0.75rem 1.5rem;
    background: #dc2626;
    color: #ffffff;
    border: none;
    border-radius: 0.375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
