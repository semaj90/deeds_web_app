<!-- ProgressiveForm.svelte - Example of properly progressive enhanced form -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { createProgressiveForm, type ProgressiveEnhancementConfig } from '$lib/utils/progressive-enhancement-audit.js';
  import type { SubmitFunction } from '@sveltejs/kit';

  // Props for form configuration
  interface Props {
    action?: string;
    method?: 'GET' | 'POST';
    initialData?: Record<string, unknown>;
    config?: Partial<ProgressiveEnhancementConfig>;
    onsubmit?: (data: FormData) => void;
    onsuccess?: (result: unknown) => void;
    onerror?: (error: string) => void;
    class?: string;
    formId?: string;
    title?: string;
    description?: string;
  }

  let {
    action = '/api/submit-form',
    method = 'POST',
    initialData = {},
	config = {},
	onsubmit = undefined,
    onsuccess = undefined,
    onerror = undefined,
    class: className = '',
    formId = `form-${Date.now()}`,
    title = 'Progressive Form',
    description = ''
  }: Props = $props();

  // Initialize progressive form utilities
  const progressiveForm = createProgressiveForm(config);

  // Form state
  let formState = $state(progressiveForm.createFormState(initialData));
  let isSubmitting = $state<boolean>(false);
  let submitMessage = $state<string>('');
  let submitMessageType = $state<'success' | 'error' | ''>('');

  // Generate field IDs for accessibility
  const fieldIds = {
    email: progressiveForm.generateFieldId('email', formId),
    password: progressiveForm.generateFieldId('password', formId),
    confirmPassword: progressiveForm.generateFieldId('confirmPassword', formId),
    firstName: progressiveForm.generateFieldId('firstName', formId),
    lastName: progressiveForm.generateFieldId('lastName', formId),
    terms: progressiveForm.generateFieldId('terms', formId)
  };

  // Validation functions
  function validateField(fieldName: string, value: unknown): string | null {
    switch (fieldName) {
      case 'email':
        return progressiveForm.validateRequired(value, 'Email') || progressiveForm.validateEmail(value);
      case 'password':
        return progressiveForm.validateRequired(value, 'Password') || progressiveForm.validateLength(value, 8, 128);
      case 'confirmPassword':
        if (value !== formState.data.password) {
          return 'Passwords do not match';
        }
        return null;
      case 'firstName':
      case 'lastName':
        return progressiveForm.validateRequired(value, fieldName);
      case 'terms':
        if (!value) {
          return 'You must accept the terms and conditions';
        }
        return null;
      default:return null;
    }
  }

  // Handle field changes with validation
  function handleFieldChange(fieldName: string, value: unknown) {
    // Update form data
    formState.data[fieldName] = value;
    formState.isDirty = true;

    // Mark field as touched
    formState.touched[fieldName] = true;

    // Validate field if real-time validation is enabled
    if (progressiveForm.config.enableRealTimeValidation && formState.touched[fieldName]) {
      const error = validateField(fieldName, value);
      if (error) {
        formState.errors[fieldName] = error;
      } else {
        delete formState.errors[fieldName];
      }
    }
  }

  // Validate entire form
  function validateForm(): boolean {
    const fields = ['email', 'password', 'confirmPassword', 'firstName', 'lastName', 'terms'];
    let isValid = true;

    for (const fieldName of fields) {
      const error = validateField(fieldName, formState.data[fieldName]);
      if (error) {
        formState.errors[fieldName] = error;
        isValid = false;
      } else {
        delete formState.errors[fieldName];
      }
    }

    return isValid;
  }

  // Enhanced submit function for SvelteKit
  const handleEnhancedSubmit: SubmitFunction = ({ formData, cancel }) => {
    // Client-side validation before submit
    if (!validateForm()) {
      cancel();

      // Focus first invalid field
      const firstErrorField = Object.keys(formState.errors)[0];
      if (firstErrorField) {
        const element = document.getElementById(fieldIds[firstErrorField as keyof typeof fieldIds]);
        element?.focus();
      }
      return;
    }

    isSubmitting = true;
    submitMessage = '';
    submitMessageType = '';

    // Call custom onsubmit handler if provided
    if (onsubmit) {
      onsubmit(formData);
    }

    return async ({ result, update }) => {
      isSubmitting = false;

      const typedResult = result as { type: string; data?: { message?: string; errors?: Record<string, string> } };

      if (typedResult.type === 'success') {
        submitMessage = 'Form submitted successfully!';
        submitMessageType = 'success';

        // Reset form on success if configured
        if (!progressiveForm.config.enableAutoSave) {
          formState = progressiveForm.createFormState();
        }

        if (onsuccess) {
          onsuccess(typedResult.data);
        }
      } else if (typedResult.type === 'failure') {
        submitMessage = typedResult.data?.message ?? 'Form submission failed. Please try again.';
        submitMessageType = 'error';

        // Handle server validation errors
        if (typedResult.data?.errors) {
          formState.errors = { ...formState.errors, ...typedResult.data.errors };
        }

        if (onerror) {
          onerror(submitMessage);
        }
      } else if (typedResult.type === 'error') {
        submitMessage = 'An unexpected error occurred. Please try again.';
        submitMessageType = 'error';

        if (onerror) {
          onerror(submitMessage);
        }
      }

      // Announce result to screen readers
      if (progressiveForm.config.announceErrors && submitMessage) {
        const announcement = document.getElementById(`${formId}-announcements`);
        if (announcement) {
          announcement.textContent = submitMessage;
        }
      }

      await update();
    };
  };

  // Handle form submission without JavaScript
  function handleNativeSubmit(event: Event) {
    // Basic client-side validation for browsers without JavaScript
    if (!validateForm()) {
      event.preventDefault();
      alert('Please correct the errors in the form');
    }
  }

  // Check if field has error
  function hasError(fieldName: string): boolean {
    return !!(formState.errors[fieldName] && formState.touched[fieldName]);
  }

  // Get field error message
  function getError(fieldName: string): string {
    return hasError(fieldName) ? formState.errors[fieldName] : '';
  }

  // Generate ARIA attributes for fields
  function getFieldAria(fieldName: string): Record<string, string | undefined> {
    const fieldId = fieldIds[fieldName as keyof typeof fieldIds];
    const errorId = progressiveForm.generateErrorId(fieldId);

    return {
      id: fieldId,
      'aria-invalid': hasError(fieldName) ? 'true'  : undefined,
      'aria-describedby': hasError(fieldName) ? errorId  : undefined,
      'aria-required': 'true'
    };
  }

  function resetForm() {
    formState = progressiveForm.createFormState();
    submitMessage = '';
    submitMessageType = '';
  }
</script>

<!-- Progressive Enhancement Form -->
<form
  id={formId}
  {action}
  {method}
  class="progressive-form {className}"
  use:enhance={handleEnhancedSubmit}
  onsubmit={handleNativeSubmit}
  novalidate
  data-progressive-enhanced="true"
>
  <!-- Form header -->
  {#if title || description}
    <div class="form-header">
      <h2 id="{formId}-title">{title}</h2>
      {#if description}
        <p id="{formId}-description">{description}</p>
      {/if}
    </div>
  {/if}

  <!-- Live region for announcements -->
  <div id="{formId}-announcements" class="sr-only" aria-live="polite" aria-atomic="true"></div>

  <!-- Form errors summary -->
  {#if Object.keys(formState.errors).length > 0 && progressiveForm.config.showSummaryErrors}
    <div class="error-summary" role="alert" aria-labelledby="{formId}-error-heading">
      <h3 id="{formId}-error-heading">Please correct the following errors:</h3>
      <ul>
        {#each Object.entries(formState.errors) as [fieldName, error]}
          <li>
            <a href="#{fieldIds[fieldName as keyof typeof fieldIds]}">{error}</a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Personal Information Fieldset -->
  <fieldset class="form-section">
    <legend>Personal Information</legend>

    <div class="form-row">
      <div class="form-group">
        <label for={fieldIds.firstName} class="form-label">First Name</label>
        <input
          id={fieldIds.firstName}
          type="text"
          name="firstName"
          class="form-input {hasError('firstName') ? 'error' : ''}"
          bind:value={formState.data.firstName}
          oninput={(e) => handleFieldChange('firstName', (e.target as HTMLInputElement).value)}
          onblur={() => (formState.touched.firstName = true)}
          aria-invalid={hasError('firstName') ? 'true'  : undefined}
          aria-describedby={hasError('firstName') ? progressiveForm.generateErrorId(fieldIds.firstName)  : undefined}
          aria-required="true"
          required
        />
        {#if hasError('firstName')}
          <div id={progressiveForm.generateErrorId(fieldIds.firstName)} class="field-error" role="alert">
            {getError('firstName')}
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label for={fieldIds.lastName} class="form-label">Last Name</label>
        <input
          id={fieldIds.lastName}
          type="text"
          name="lastName"
          class="form-input {hasError('lastName') ? 'error' : ''}"
          bind:value={formState.data.lastName}
          oninput={(e) => handleFieldChange('lastName', (e.target as HTMLInputElement).value)}
          onblur={() => (formState.touched.lastName = true)}
          aria-invalid={hasError('lastName') ? 'true'  : undefined}
          aria-describedby={hasError('lastName') ? progressiveForm.generateErrorId(fieldIds.lastName)  : undefined}
          aria-required="true"
          required
        />
        {#if hasError('lastName')}
          <div id={progressiveForm.generateErrorId(fieldIds.lastName)} class="field-error" role="alert">
            {getError('lastName')}
          </div>
        {/if}
      </div>
    </div>
  </fieldset>

  <!-- Account Information Fieldset -->
  <fieldset class="form-section">
    <legend>Account Information</legend>

    <div class="form-group">
      <label for={fieldIds.email} class="form-label">Email Address</label>
      <input
        id={fieldIds.email}
        type="email"
        name="email"
        class="form-input {hasError('email') ? 'error' : ''}"
        bind:value={formState.data.email}
        oninput={(e) => handleFieldChange('email', (e.target as HTMLInputElement).value)}
        onblur={() => (formState.touched.email = true)}
        aria-invalid={hasError('email') ? 'true'  : undefined}
        aria-describedby={hasError('email') ? progressiveForm.generateErrorId(fieldIds.email)  : undefined}
        aria-required="true"
        autocomplete="email"
        required
      />
      {#if hasError('email')}
        <div id={progressiveForm.generateErrorId(fieldIds.email)} class="field-error" role="alert">
          {getError('email')}
        </div>
      {/if}
    </div>

    <div class="form-group">
      <label for={fieldIds.password} class="form-label">Password</label>
      <input
        id={fieldIds.password}
        type="password"
        name="password"
        class="form-input {hasError('password') ? 'error' : ''}"
        bind:value={formState.data.password}
        oninput={(e) => handleFieldChange('password', (e.target as HTMLInputElement).value)}
        onblur={() => (formState.touched.password = true)}
        aria-invalid={hasError('password') ? 'true'  : undefined}
        aria-describedby={hasError('password') ? progressiveForm.generateErrorId(fieldIds.password)  : undefined}
        aria-required="true"
        autocomplete="new-password"
        minlength="8"
        required
      />
      <div class="field-hint">Password must be at least 8 characters long</div>
      {#if hasError('password')}
        <div id={progressiveForm.generateErrorId(fieldIds.password)} class="field-error" role="alert">
          {getError('password')}
        </div>
      {/if}
    </div>

    <div class="form-group">
      <label for={fieldIds.confirmPassword} class="form-label">Confirm Password</label>
      <input
        id={fieldIds.confirmPassword}
        type="password"
        name="confirmPassword"
        class="form-input {hasError('confirmPassword') ? 'error' : ''}"
        bind:value={formState.data.confirmPassword}
        oninput={(e) => handleFieldChange('confirmPassword', (e.target as HTMLInputElement).value)}
        onblur={() => (formState.touched.confirmPassword = true)}
        aria-invalid={hasError('confirmPassword') ? 'true'  : undefined}
        aria-describedby={hasError('confirmPassword') ? progressiveForm.generateErrorId(fieldIds.confirmPassword)  : undefined}
        aria-required="true"
        autocomplete="new-password"
        required
      />
      {#if hasError('confirmPassword')}
        <div id={progressiveForm.generateErrorId(fieldIds.confirmPassword)} class="field-error" role="alert">
          {getError('confirmPassword')}
        </div>
      {/if}
    </div>
  </fieldset>

  <!-- Terms and Conditions -->
  <fieldset class="form-section">
    <legend>Terms and Conditions</legend>

    <div class="form-group checkbox-group">
      <input
        id={fieldIds.terms}
        type="checkbox"
        name="terms"
        class="form-checkbox"
        checked={formState.data.terms as boolean}
        onchange={(e) => handleFieldChange('terms', (e.target as HTMLInputElement).checked)}
        aria-describedby={hasError('terms') ? progressiveForm.generateErrorId(fieldIds.terms)  : undefined}
        required
      />
      <label for={fieldIds.terms} class="checkbox-label">
        I agree to the <a href="/terms" target="_blank">Terms and Conditions</a> and
        <a href="/privacy" target="_blank">Privacy Policy</a>
      </label>
      {#if hasError('terms')}
        <div id={progressiveForm.generateErrorId(fieldIds.terms)} class="field-error" role="alert">
          {getError('terms')}
        </div>
      {/if}
    </div>
  </fieldset>

  <!-- Form actions -->
  <div class="form-actions">
    <button
      type="submit"
      class="submit-button primary"
      disabled={isSubmitting}
      aria-describedby={submitMessage ? `${formId}-submit-status`  : undefined}
    >
      {#if isSubmitting}
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>Submitting...</span>
      {:else}
        Submit Form
      {/if}
    </button>

    <button type="button" class="reset-button secondary" onclick={resetForm} disabled={isSubmitting}>
      Reset Form
    </button>
  </div>

  <!-- Submit status message -->
  {#if submitMessage}
    <div
      id="{formId}-submit-status"
      class="submit-message {submitMessageType}"
      role={submitMessageType === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {submitMessage}
    </div>
  {/if}
</form>


<style>
  .progressive-form {
    max-width: 600px;
	margin: 0 auto;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }

  .form-header {
    margin-bottom: 32px;
    text-align: center;
  }

  .form-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: 600;
	color: #1f2937;
  }

  .form-header p {
    margin: 0;
	color: #6b7280;
  }

  .sr-only {
    position: absolute;
	width: 1px;
    height: 1px;
	padding: 0;
    margin: -1px;
	overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
	border: 0;
  }

  .error-summary {
    background: #fef2f2;
	border: 1px solid #fecaca;
    border-radius: 8px;
	padding: 16px;
    margin-bottom: 24px;
  }

  .error-summary h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
	color: #dc2626;
  }

  .error-summary ul {
    margin: 0;
    padding-left: 20px;
  }

  .error-summary li {
    margin-bottom: 4px;
  }

  .error-summary a {
    color: #dc2626;
    text-decoration: underline;
  }

  .form-section {
    border: 1px solid #d1d5db;
    border-radius: 8px;
	padding: 24px;
    margin-bottom: 24px;
  }

  .form-section legend {
    font-size: 18px;
    font-weight: 600;
	color: #1f2937;
    padding: 0 8px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
	gap: 8px;
    margin-bottom: 20px;
  }

  .form-label {
    font-size: 14px;
    font-weight: 500;
	color: #374151;
  }

  .form-input {
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 16px;
    line-height: 1.5;
	transition:border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .form-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-input.error {
    border-color: #dc2626;
  }

  .form-input.error:focus {
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .checkbox-group {
    flex-direction: row;
    align-items: flex-start;
	gap: 12px;
  }

  .form-checkbox {
    width: 18px;
	height: 18px;
    margin-top: 2px;
    flex-shrink: 0;
  }

  .checkbox-label {
    font-size: 14px;
    line-height: 1.5;
	color: #374151;
    margin: 0;
  }

  .checkbox-label a {
    color: #3b82f6;
    text-decoration: underline;
  }

  .field-hint {
    font-size: 12px;
	color: #6b7280;
  }

  .field-error {
    font-size: 12px;
	color: #dc2626;
    font-weight: 500;
  }

  .form-actions {
    display: flex;
	gap: 16px;
    justify-content: center;
    margin-top: 32px;
  }

  .submit-button,
  .reset-button {
    display: flex;
    align-items: center;
	gap: 8px;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 500;
	cursor: pointer;
    transition:all 0.2s ease;
    border: none;
  }

  .submit-button.primary {
    background: #3b82f6;
	color: white;
  }

  .submit-button.primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .submit-button.primary:disabled {
    background: #9ca3af;
	cursor: not-allowed;
  }

  .reset-button.secondary {
    background: #f3f4f6;
	color: #374151;
    border: 1px solid #d1d5db;
  }

  .reset-button.secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .reset-button.secondary:disabled {
    opacity: 0.5;
	cursor: not-allowed;
  }

  .loading-spinner {
    width: 16px;
	height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
	animation: spin 1s linear infinite;
  }

  .submit-message {
    margin-top: 16px;
	padding: 12px;
    border-radius: 6px;
    text-align: center;
    font-weight: 500;
  }

  .submit-message.success {
    background: #f0fdf4;
	color: #166534;
    border: 1px solid #bbf7d0;
  }

  .submit-message.error {
    background: #fef2f2;
	color: #dc2626;
    border: 1px solid #fecaca;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .progressive-form {
      padding: 16px;
    }

    .form-row {
      grid-template-columns: 1fr;
	gap: 0;
    }

    .form-actions {
      flex-direction: column;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .form-input,
    .submit-button,
    .reset-button {
      border-width: 2px;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .form-input,
    .submit-button,
    .reset-button {
      transition:none;
    }

    .loading-spinner {
      animation: none;
	border: 2px solid currentColor;
      border-top-color: transparent;
    }
  }

  /* Print styles */
  @media print {
    .form-actions {
      display: none;
    }
  }
</style>
