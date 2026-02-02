<script lang="ts">
  import { zod } from 'sveltekit-superforms/adapters';
  import { superForm } from 'sveltekit-superforms/client';
  import { z } from 'zod';

  interface Props {
    poi?: Record<string, unknown> | null;
    onSubmit?: ((formData: FormData) => Promise<void>) | null;
  }

  let { poi = null, onSubmit = null }: Props = $props();

  const poiSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    dateOfBirth: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(['person_of_interest', 'witness', 'suspect', 'victim', 'informant']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    threatLevel: z.enum(['low', 'medium', 'high', 'extreme']),
    occupation: z.string().optional(),
    lastKnownLocation: z.string().optional(),
    physicalDescription: z.string().optional()
  });

  // Use a function to get current poi value
  const getInitialData = () => poi || {};

  const { form, errors, enhance, submitting } = superForm(getInitialData(),
	{
    validators: zod(poiSchema),
    onSubmit: async ({ formData }) => {
      if (onSubmit) {
        await onSubmit(formData);
      }
    }
  });

  const statusOptions = [
    { value: 'person_of_interest', label: 'Person of Interest' },
	{ value: 'witness', label: 'Witness' },
	{ value: 'suspect', label: 'Suspect' },
	{ value: 'victim', label: 'Victim' },
	{ value: 'informant', label: 'Informant' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'critical', label: 'Critical' }
  ];

  const threatLevelOptions = [
    { value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'extreme', label: 'Extreme' }
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
    <label for="dateOfBirth">Date of Birth</label>
    <input
      id="dateOfBirth"
      type="date"
      name="dateOfBirth"
      bind:value={$form.dateOfBirth}
    />
  </div>

  <div class="form-group">
    <label for="email">Email</label>
    <input
      id="email"
      type="email"
      name="email"
      bind:value={$form.email}
      placeholder="email@example.com"
      class:error={$errors.email}
    />
    {#if $errors.email}
      <span class="error-message">{$errors.email}</span>
    {/if}
  </div>

  <div class="form-group">
    <label for="phone">Phone</label>
    <input
      id="phone"
      type="tel"
      name="phone"
      bind:value={$form.phone}
      placeholder="(555) 123-4567"
    />
  </div>

  <div class="form-group">
    <label for="address">Address</label>
    <textarea
      id="address"
      name="address"
      bind:value={$form.address}
      placeholder="Street address"
      rows="2"
    ></textarea>
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
    <label for="priority">Priority *</label>
    <select
      id="priority"
      name="priority"
      bind:value={$form.priority}
      class:error={$errors.priority}
    >
      <option value="">Select priority</option>
      {#each priorityOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    {#if $errors.priority}
      <span class="error-message">{$errors.priority}</span>
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
    <label for="occupation">Occupation</label>
    <input
      id="occupation"
      type="text"
      name="occupation"
      bind:value={$form.occupation}
      placeholder="Job title or profession"
    />
  </div>

  <div class="form-group">
    <label for="lastKnownLocation">Last Known Location</label>
    <input
      id="lastKnownLocation"
      type="text"
      name="lastKnownLocation"
      bind:value={$form.lastKnownLocation}
      placeholder="City, state, or address"
    />
  </div>

  <div class="form-group">
    <label for="physicalDescription">Physical Description</label>
    <textarea
      id="physicalDescription"
      name="physicalDescription"
      bind:value={$form.physicalDescription}
      placeholder="Height, build, distinguishing features, etc."
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
	transition:border-color 0.2s;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  input.error,
  select.error {
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
    transition:background-color 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn-primary:disabled {
    opacity: 0.5;
	cursor: not-allowed;
  }
</style>
