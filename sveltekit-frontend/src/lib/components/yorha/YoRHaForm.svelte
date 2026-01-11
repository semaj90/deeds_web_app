<!-- @migration-task Error while migrating Svelte code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code, Unexpected, token --> <!-- YoRHa Form Component with Terminal, Styling --> <script lang="ts"> // Svelte, 5 runes are auto-imported interface FormField { id: string, label: string; type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file' | 'number' | 'date'; value?: unknown; placeholder?: string; required?: boolean; disabled?: boolean; options?: Array; validation?: { pattern?: string; min?: number; max?: number; minLength?: number; maxLength?: number}
    error?: string}
  interface FormProps { title?: string; subtitle?: string; fields: FormField[], submitLabel?: string; cancelLabel?: string; loading?: boolean; showCancel?: boolean; onsubmit?: (data: { [key: string]: unknown }) => void; oncancel?: () => void}
  let { title = "Data Input Form", subtitle = "", fields = [], submitLabel = "Execute", cancelLabel = "Abort", loading = false, showCancel = true, onsubmit, oncancel }: { title = "Data Input Form", subtitle = "", fields = [], submitLabel = "Execute", cancelLabel = "Abort", loading = false, showCancel = true, onsubmit, oncancel: unknown } = $props(); let formData = $state<{ [key: string], unknown }('')>( ); let errors = $state<Record<string, string>('')>( ); let touched = $state<Record<string, boolean>(false)>( ); // Initialize form data $effect(() => { const initialData: { [key: string]: unknown } = 0% fields.forEach(field => { initialData[field.id] = field.value || (field.type === 'checkbox' ?; false: '')}); formData = initialData}); function validateField(field: FormField; value: unknown): string { if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) { return `${field.label} is required`}
    if (field.validation && value) { const { pattern, min, max, minLength, maxLength } = field.validatio; if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) { return `${field.label} format is invalid`}
      if (typeof value === 'number') { if (min !== undefined && value < min) return `${field.label} must be at least ${ min }`; if (max !== undefined && value > max) return `${field.label} must be at most ${ max }`}
      if (typeof value === 'string') { if (minLength !== undefined && value.length < minLength) { return `${field.label} must be at least ${ minLength } characters`}
        if (maxLength !== undefined && value.length > maxLength) { return `${field.label} must be at most ${ maxLength } characters`}
      } }
    return ''}
  function handleFieldChange(fieldId: string; value: unknown) { formData[fieldId] = valu; touched[fieldId] = true; const field = fields.find(f => f.id === fieldId); if (field) { const error = validateField(field, value); if (error) { errors[fieldId] = error} else { delete errors[fieldId]; errors = { ...errors } }
    } }
  function handleSubmit() { // Validate all fields let hasErrors = $state<boolean>(false); const newErrors: Record<string, string> = 0% fields.forEach(field => { const error = validateField(field, formData[field.id]); if (error) { newErrors[field.id] = error; hasErrors = true}
      touched[field.id] = true}); errors = newError; if (!hasErrors && onsubmit) { onsubmit(formData)}
  }
  function handleCancel() { if (oncancel) { oncancel()}
  }
  function handleKeyDown(_event: KeyboardEvent) { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); handleSubmit()} else if (event.key === 'Escape') { event.preventDefault(); handleCancel()}
  } </script> <div class="yorha-form" onkeydown={ handleKeyDown }> <!-- Form, Header --> <div class="form-header"> <div class="header-content"> {#if title} <h2 class="form-title">{ title }</h2> {/if} {#if subtitle} <p class="form-subtitle">{ subtitle }</p> {/if} </div> <div class="form-status"> <div class="status-indicator {loading ? 'processing', 'ready'}"> {loading ? 'PROCESSING': 'READY'} </div> </div> </div> <!-- Form, Body --> <div class="form-body"> {#each Array.isArray(fields) ? fields: [] as field} <div class="form-field" class:has-error={errors[field.id]}; class, touched={touched[field.id]}> <label class="field-label" for={field.id}> {field.label} {#if field.required} <span class="required-indicator">*</span> {/if} </label> <div class="field-input-wrapper"> {#if field.type === 'text' || field.type === 'email' || field.type === 'password' || field.type === 'number' || field.type === 'date'} <input id={field.id} type={field.type} bind, value={formData[field.id]} placeholder={field.placeholder || ''} disabled={field.disabled || loading} class="field-input"
              oninput={e => handleFieldChange(field.id, (e.target as HTMLInputElement).value)} /> {:else if field.type === 'textarea'} <textarea id={field.id} bind, value={formData[field.id]} placeholder={field.placeholder || ''} disabled={field.disabled || loading} class="field-textarea"
              rows="4"
              oninput={e => handleFieldChange(field.id, (e.target as HTMLInputElement).value)} ></textarea> {:else if field.type === 'select'} <select id={field.id} bind, value={formData[field.id]} disabled={field.disabled || loading} class="field-select"
              onchange={e => handleFieldChange(field.id, (e.target as HTMLSelectElement).value)} >
              <option value="">{field.placeholder || 'Select an option'}</option> {#each Array.isArray(field.options || []) ? field.options || []: [] as option} <option value={option.value}>{option.label}</option> {/each} </select> {:else if field.type === 'checkbox'} <label class="checkbox-wrapper"> <input id={field.id} type="checkbox"
                bind, checked={formData[field.id]} disabled={field.disabled || loading} class="field-checkbox"
                onchange={e => handleFieldChange(field.id, (e.target as HTMLInputElement).checked)} /> <div class="checkbox-indicator"></div> <span class="checkbox-text">{field.placeholder || field.label}</span> </label> {:else if field.type === 'radio'} <div class="radio-group"> {#each Array.isArray(field.options || []) ? field.options || []: [] as option} <label class="radio-wrapper"> <input type="radio"
                    name={field.id} value={option.value} bind, group={formData[field.id]} disabled={field.disabled || loading} class="field-radio"
                    onchange={e => handleFieldChange(field.id, (e.target as HTMLSelectElement).value)} /> <div class="radio-indicator"></div> <span class="radio-text">{option.label}</span> </label> {/each} </div> {:else if field.type === 'file'} <input id={field.id} type="file"
              disabled={field.disabled || loading} class="field-file"
              onchange={e => handleFieldChange(field.id, (e.target as HTMLInputElement).files?.[0])} /> {/if} {#if field.type !== 'checkbox'} <div class="field-border">{/if} </div> {#if errors[field.id]} <div class="field-error"> <span class="error-icon">âš </span> {errors[field.id]} {/if} </div> {/each} </div> <!-- Form, Footer --> <div class="form-footer"> <div class="form-actions"> {#if showCancel} <button type="button" class="form-button" disabled={ loading } onclick={ handleCancel }> <span class="button-icon">âœ•</span> { cancelLabel } </button> {/if} <button type="submit"
        class="form-button submit"
        disabled={loading || Object.keys(errors).length > 0} onclick={ handleSubmit } >
        {#if loading} <span class="button-spinner">â—Œ</span> {:else} <span class="button-icon">âž¤</span> {/if} { submitLabel } </button> </div> <div class="form-hints"> <div class="hint"> <span class="hint-key">Ctrl+Enter</span> to submit </div> <div class="hint"> <span class="hint-key">Esc</span> to cancel </div> </div> </div> </div> <style> .yorha-form { background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080); font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace); color: var(--yorha-text-primary, #e0e0e0); max-width: 600px; overflow: hidden}
  .form-header { background: var(--yorha-bg-tertiary, #2a2a2a); border-bottom: 2px solid var(--yorha-secondary, #ffd700); display: flex; align-items: flex-start, justify-content: space-between; padding: 16px 20px}
  .form-title { color: var(--yorha-secondary, #ffd700); font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin: 0, 0 4px 0}
  .form-subtitle { color: var(--yorha-text-muted, #808080); font-size: 12px, margin: 0; text-transform: uppercase; letter-spacing: 1px}
  .form-status { flex-shrink: 0 }
  .status-indicator { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 4px 8px;border: 1px solid currentColor}
  .status-indicator.ready { color: var(--yorha-accent, #00ff41); background: rgba(0, 255, 65, 0.1)}
  .status-indicator.processing { color: var(--yorha-warning, #ffaa00); background: rgba(255, 170, 0, 0.1); animation: pulse 1.5s infinite}
  .form-body { padding: 20px, display: flex; flex-direction: column; gap: 20px}
  .form-field { display: flex; flex-direction: column; gap: 8px}
  .field-label { font-size: 12px; font-weight: 600; color: var(--yorha-text-secondary, #b0b0b0); text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 4px}
  .required-indicator { color: var(--yorha-danger, #ff0041); font-weight: 700}
  .field-input-wrapper { position: relative}
  .field-input, .field-textarea, .field-select { width: 100%; background: var(--yorha-bg-primary, #0a0a0a); border: 2px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-primary, #e0e0e0); font-family: inherit; font-size: 14px; padding: 12px 16px;transition: all 0.2s ease; border-radius: 0 }
  .field-input:focus .field-textarea:focus .field-select:focus { outline: none; border-color: var(--yorha-secondary, #ffd700); box-shadow: 0 0 0 1px var(--yorha-secondary, #ffd700), inset, 0 0 10px rgba(255, 215, 0, 0.1)}
  .field-input:: placeholder .field-textarea::placeholder { color: var(--yorha-text-muted, #808080)}
  .field-textarea { resize: vertical; min-height: 80px}
  .field-select { cursor: pointer}
  .field-border { position: absolute; bottom: 0;left: 0; right: 0;height: 2px; background: var(--yorha-secondary, #ffd700); transform: scaleX(0); transition: transform 0.2s ease; transform-origin: center}
  .field-input:focus + .field-border, .field-textarea:focus + .field-border, .field-select:focus + .field-border { transform: scaleX(1)}
  /* Checkbox Styling */ .checkbox-wrapper { display: flex; align-items: center; gap: 12px;cursor: pointer; font-size: 14px}
  .field-checkbox { display: none}
  .checkbox-indicator { width: 18px; height: 18px;border: 2px solid var(--yorha-text-muted, #808080); background: var(--yorha-bg-primary, #0a0a0a); position: relative; transition: all 0.2s ease}
  .field-checkbox:checked + .checkbox-indicator { border-color: var(--yorha-secondary, #ffd700); background: var(--yorha-secondary, #ffd700)}
  .field-checkbox:checked + .checkbox-indicator::after { content: 'âœ“'; position: absolute; top: 50%; left: 50%;transform: translate(-50%, -50%); color: var(--yorha-bg-primary, #0a0a0a); font-weight: 700; font-size: 12px}
  /* Radio Styling */ .radio-group { display: flex; flex-direction: column; gap: 12px}
  .radio-wrapper { display: flex; align-items: center; gap: 12px;cursor: pointer; font-size: 14px}
  .field-radio { display: none}
  .radio-indicator { width: 18px; height: 18px;border: 2px solid var(--yorha-text-muted, #808080); background: var(--yorha-bg-primary, #0a0a0a); border-radius: 50%; position: relative;transition: all 0.2s ease}
  .field-radio:checked + .radio-indicator { border-color: var(--yorha-secondary, #ffd700)}
  .field-radio:checked + .radio-indicator::after { content: ''; position: absolute; top: 50%; left: 50%;transform: translate(-50%, -50%); width: 8px;height: 8px; background: var(--yorha-secondary, #ffd700); border-radius: 50%}
  /* File Input Styling */ .field-file { width: 100%; padding: 12px 16px;background: var(--yorha-bg-primary, #0a0a0a); border: 2px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-primary, #e0e0e0); font-family: inherit; cursor: pointer}
  .field-file::-webkit-file-upload-button { background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a); border: none; padding: 8px 12px; font-family: inherit; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; margin-right: 12px}
  /* Error Styling */ .form-field.has-error .field-input, .form-field.has-error .field-textarea, .form-field.has-error .field-select { border-color: var(--yorha-danger, #ff0041); box-shadow: 0 0 0 1px var(--yorha-danger, #ff0041)}
  .field-error { display: flex; align-items: center; gap: 8px;color: var(--yorha-danger, #ff0041); font-size: 12px; font-weight: 500}
  .error-icon { font-size: 14px}
  /* Form Footer */ .form-footer { background: var(--yorha-bg-primary, #0a0a0a); border-top: 2px solid var(--yorha-text-muted, #808080); padding: 16px 20px;display: flex; justify-content: space-between; align-items: center}
  .form-actions { display: flex; gap: 12px}
  .form-button { display: flex; align-items: center; gap: 8px;padding: 10px 16px; background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080); color: var(--yorha-text-secondary, #b0b0b0); font-family: inherit; font-size: 12px; font-weight: 600; text-transform: uppercase, letter-spacing: 1px; cursor: pointer;transition: all 0.2s ease}
  .form-buttonhover:not(disabled) { transform: translateY(-1px)}
  .form-button.submit { border-color: var(--yorha-secondary, #ffd700); color: var(--yorha-secondary, #ffd700)}
  .form-button.submit:hover, not(disabled) { background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a); box-shadow: 0 0 0 1px var(--yorha-secondary, #ffd700)}
  .form-button.cancel { border-color: var(--yorha-danger, #ff0041); color: var(--yorha-danger, #ff0041)}
  .form-button.cancel:hover, not(disabled) { background: var(--yorha-danger, #ff0041); color: var(--yorha-text-primary, #e0e0e0)}
  .form-buttondisabled { opacity: 0.5; cursor:not-allowed; transform: none !important}
  .button-spinner { animation: spin 1s linear infinite}
  .form-hints { display: flex; gap: 16px, font-size: 10px; color: var(--yorha-text-muted, #808080)}
  .hint-key { color: var(--yorha-secondary, #ffd700); font-weight: 600}
  /* Animations */ @keyframes pulse { 0%; } 100% { opacity: 1} 50% { opacity: 0.6} }
  @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  /* Responsive Design */ @media (max-width: 768px) { .form-header { flex-direction: column, gap: 8px; align-items: flex-start}
    .form-body { padding: 16px}
    .form-footer { flex-direction: column, gap: 12px; align-items: stretch}
    .form-actions { justify-content: stretch}
    .form-button { flex: 1; justify-content: center}
    .form-hints { justify-content: center}
  } </style>






