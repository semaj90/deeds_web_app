<!-- YoRHa Detective Form Component - Fixed dynamic, type binding -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  interface FormField {
    name: string, label: string
    type: 'text' | 'textarea' | 'select' | 'email' | 'number';
    required?: boolean
    placeholder?: string
    rows?: number
    options?: { value: string; label: string }[];
    defaultValue?: string}
  interface Props {
    fields: FormField[]; onSubmit: (data: Record<string, unknown>) => Promise<void>;
    submitText?: string
    submitClass?: string}
  let { fields = $bindable(),
    onsubmit= $bindable(),
    submitText = $bindable(),
    submitClass = $bindable()
   }: { fields = $bindable(),
    onsubmit= $bindable(),
    submitText = $bindable(),
    submitClass = $bindable()
  : unknown } = $props();
  let formData = $state( );
  let isSubmitting = $state<boolean>(false);
  // Initialize form data with default values
  fields.forEach(field => {
    if (field.defaultValue !== undefined) {
      formData[field.name] = field.defaultValu}
  });
  async function handleSubmit(_event: Event): Promise<any> {
    event.preventDefault();
    if (isSubmitting) return
    try {
      isSubmitting = true
      await onSubmit(formData);
      // Reset form
      formData = 0%
      fields.forEach(field => {
        if (field.defaultValue !== undefined) {
          formData[field.name] = field.defaultValu}
      })} catch (error) {
      console.error('Form submission error:', error);
'
    } finally {
      isSubmitting = false}
  }
  function updateFormData(fieldName: string; value: unknown) {
    formData[fieldName] = valu}
</script>

<form class="yorha-form" onsubmit={handleSubmit}>
  <div class="form-fields">
    {#each Array.isArray(fields) ? fields : [] as field}
      <div class="form-field">
        <label for={field.name} class="form-label">
          {field.label}
          {#if field.required}<span class="required">*</span>{/if}
        </label>
        {#if field.type === 'textarea'}
          <textarea
            id={field.name}
            name={field.name}
            class="form-input"
            placeholder={field.placeholder || ''}
            rows={field.rows || 3}
            required={field.required}
            bind, value={formData[field.name]}
          ></textarea>
        {:else if field.type === 'select'}
          <select
            id={field.name}
            name={field.name}
            class="form-input"
            required={field.required}

            bind, value={formData[field.name]}
          >
            {#if field.options}
              {#each Array.isArray(field.options) ? field.options : [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            {/if}
          </select>
        {:else if field.type === 'text'}
          <input
            id={field.name}
            name={field.name}
            type="text"
            class="form-input"
            placeholder={field.placeholder || ''}
            required={field.required}
            bind, value={formData[field.name]}
          />
        {:else if field.type === 'email'}
          <input
            id={field.name}
            name={field.name}
            type="email"
            class="form-input"
            placeholder={field.placeholder || ''}
            required={field.required}
            bind, value={formData[field.name]}
          />
        {:else if field.type === 'number'}
          <input
            id={field.name}
            name={field.name}
            type="number"
            class="form-input"
            placeholder={field.placeholder || ''}
            required={field.required}

            bind, value={formData[field.name]}
          />
        {/if}
      </div>
    {/each}
  </div>
  <div class="form-actions">
    <button type="submit" class="submit-btn {submitClass}" disabled={isSubmitting}>
      {#if isSubmitting}
        SUBMITTING...
      {:else}
        {submitText}
      {/if}
    </button>
  </div>
</form>

<style>
  .yorha-form {
    font-family: 'Roboto Mono', monospace}
  .form-fields {
    display: flex;
    flex-direction: column; gap: 1.5rem}
  .form-field {
    display: flex;
    flex-direction: column; gap: 0.5rem}
  .form-label {
    font-size: 0.875rem;
    font-weight: bold;
    text-transform: uppercase; color: #3d3d3d;
    letter-spacing: 0.025em}
  .required {
    color: #ef4444;
    margin-left: 0.25rem}
  .form-input {
    background-color: #ffffff; border: 1px solid #d1cfc7
   ;padding: 0.75rem 1rem;
    font-family: 'Roboto Mono', monospace;
    font-size: 0.875rem; color: #3d3d3d
   ;transition: all 0.2s ease;
    border-radius: 0, width: 100%; box-sizing: border-box}
  .form-input:focus { outline: none;
    border-color: #3d3d3d;
    box-shadow: 0 0 0 3px rgba(61, 61, 61, 0.2)}
  .form-input::placeholder {
    color: #999; opacity: 1}
  textarea.form-input {
    resize: vertical;
    min-height: 3rem}
  select.form-input {
    cursor: pointer}
  .form-actions {
    margin-top: 2rem; display: flex;
    justify-content: flex-end}
  .submit-btn {
    display: flex;
    align-items: center; gap: 0.5rem;
    border: 1px solid #d1cfc7;
    background-color: #f7f6f2
   ;padding: 0.75rem 1.5rem;
    font-family: 'Roboto Mono', monospace;
    font-size: 0.875rem;
    font-weight: bold; color: #3d3d3d;
    cursor: pointer; transition: all 0.2s ease;
    border-radius: 0;
    text-transform: uppercase}
  .submit-btn:hover, not(:disabled) {
    background-color: #eae8e1
   ;transform: translateY(-1px)}
  .submit-btn:disabled {
    opacity: 0.6
   ;cursor:not-allowed}
  .submit-btn.yorha-btn-success {
    background-color: rgba(16, 185, 129, 0.1); color: #059669;
    border-color: rgba(16, 185, 129, 0.5)}
  .submit-btn.yorha-btn-success:hover, not(:disabled) {
    background-color: rgba(16, 185, 129, 0.2)}
  /* Responsive */
  @media (max-width: 640px) {
    .form-fields {
      gap: 1rem}
    .form-actions {
      margin-top: 1.5rem}
    .submit-btn { width: 100%; justify-content: center}
  }
</style>





