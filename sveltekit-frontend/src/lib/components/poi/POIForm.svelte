<script lang="ts">
  import { superForm } from 'sveltekit-superforms/client';
  import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import { goto } from '$app/navigation';
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

  let photoFile = $state<File | null>(null);
  let photoPreview = $state('');
  let uploadingPhoto = $state(false);

  function handlePhotoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPEG, PNG, WebP, and GIF images are allowed');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10MB');
      input.value = '';
      return;
    }

    photoFile = file;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoPreview = URL.createObjectURL(file);
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoFile = null;
    photoPreview = '';
  }

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(formData, {
    validators: zodClient(poiSchema),
    resetForm: false,
    onResult({ result, cancel }) {
      if (result.type === 'redirect') {
        const redirectUrl = (result as any).location as string;
        const match = redirectUrl?.match(/\/persons-of-interest\/([a-f0-9-]+)/i);

        if (match && photoFile) {
          cancel();

          const poiId = match[1];
          uploadingPhoto = true;

          const fd = new FormData();
          fd.append('file', photoFile);

          fetch(`/api/persons-of-interest/${poiId}/photos`, {
            method: 'POST',
            body: fd
          }).then((res) => {
            if (res.ok) {
              toast.success('Person of interest created with photo');
            } else {
              toast.warning('POI created, but photo upload failed');
            }
          }).catch(() => {
            toast.warning('POI created, but photo upload failed');
          }).finally(() => {
            uploadingPhoto = false;
            clearPhoto();
            goto(redirectUrl);
          });
        } else {
          toast.success('Person of interest created successfully');
        }
      }
    }
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

  <!-- Photo Upload -->
  <div class="form-group full-width">
    <label for="photo">Photo (optional)</label>
    <div class="photo-upload-area">
      {#if photoPreview}
        <div class="photo-preview-container">
          <img src={photoPreview} alt="Preview" class="photo-preview" />
          <button type="button" class="photo-remove" onclick={clearPhoto}>Remove</button>
        </div>
      {:else}
        <label for="photo" class="photo-dropzone">
          <span class="photo-icon">+</span>
          <span>Click to add photo</span>
          <span class="photo-hint">JPEG, PNG, WebP, GIF — max 10MB</span>
        </label>
      {/if}
      <input
        id="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onchange={handlePhotoSelect}
        class="photo-input"
      />
    </div>
  </div>

  <div class="form-actions">
    <button type="submit" disabled={$submitting || uploadingPhoto} class="btn-primary">
      {#if uploadingPhoto}
        Uploading photo...
      {:else if $submitting}
        Saving...
      {:else}
        Save POI
      {/if}
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

  .full-width {
    grid-column: 1 / -1;
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

  .photo-upload-area {
    position: relative;
  }

  .photo-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
  }

  .photo-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    border: 2px dashed #333;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .photo-dropzone:hover {
    border-color: #dc2626;
    background: rgba(220, 38, 38, 0.05);
  }

  .photo-icon {
    font-size: 2rem;
    line-height: 1;
    color: #555;
  }

  .photo-hint {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .photo-preview-container {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .photo-preview {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 0.5rem;
    border: 2px solid #333;
  }

  .photo-remove {
    padding: 0.4rem 0.75rem;
    background: #7f1d1d;
    color: #fecaca;
    border: 1px solid #dc2626;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  .photo-remove:hover {
    background: #991b1b;
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
