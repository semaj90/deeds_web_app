<script lang="ts">
  // Migrated to $effect

  export interface FormField {
    id: string;
	label: string;
    type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
    value?: any;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    options?: {
	label: string; value: any }[];
    validation?: {
      pattern?: string;
      min?: number;
      max?: number;
      minLength?: number;
      maxLength?: number;
    };
  }

  let {
    title = "Data Input Form",
    subtitle = "",
    fields = [],
    submitLabel = "Execute",
    cancelLabel = "Abort",
    loading = false,
    showCancel = true,
    onsubmit = (data: any) => { },
	oncancel = () => { }
  }: {
    title?: string;
    subtitle?: string;
	fields: FormField[];
    submitLabel?: string;
    cancelLabel?: string;
    loading?: boolean;
    showCancel?: boolean;
    onsubmit?: (data: Record<string, any>) => void;
    oncancel?: () => void;
  } = $props();

  let formData = $state<Record<string, any>>({});
  let errors = $state<Record<string, string>>({});
  let touched = $state<Record<string, boolean>>({});

  // Initialize form data
  $effect(() => {

    const initial: Record<string, any> = {};
    fields.forEach(f => {
      initial[f.id] = f.value !== undefined ? f.value : (f.type === 'checkbox' ? false : '');

});
    formData = initial;
  });

  function validateField(field: FormField, value: any): string {
    if (field.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
      return `${field.label} is required`;
    }
    if (field.validation && value) {
      const { pattern, min, max, minLength, maxLength } = field.validation;
      if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
        return `${field.label} format is invalid`;
      }
      if (typeof value === 'number') {
        if (min !== undefined && value < min) return `${field.label} min: ${min}`;
        if (max !== undefined && value > max) return `${field.label} max: ${max}`;
      }
      if (typeof value === 'string') {
        if (minLength !== undefined && value.length < minLength) return `${field.label} min length: ${minLength}`;
        if (maxLength !== undefined && value.length > maxLength) return `${field.label} max length: ${maxLength}`;
      }
    }
    return '';
  }

  function handleInput(fieldId: string, value: any) {
    formData[fieldId] = value;
    touched[fieldId] = true;
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      const error = validateField(field, value);
      if (error) errors[fieldId] = error;
      else delete errors[fieldId];
    }
  }

  function handleSubmit() {
    let hasErrors = false;
    fields.forEach(field => {
      const error = validateField(field, formData[field.id]);
      if (error) {
        errors[field.id] = error;
        hasErrors = true;
      }
      touched[field.id] = true;
    });
    if (!hasErrors) {
      onsubmit({ ...formData });
    }
  }
</script>

<div class="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow-2xl max-w-2xl w-full">
  <!-- Header -->
  <div class="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-start">
    <div>
      <h2 class="text-sm font-bold text-cyan-500 tracking-[0.2em] uppercase">{title}</h2>
      {#if subtitle}
        <p class="text-[10px] text-slate-500 font-mono uppercase mt-1">{subtitle}</p>
      {/if}
    </div>
    <div class="px-2 py-1 border border-cyan-500/30 text-[10px] font-mono {loading ? 'text-yellow-500 animate-pulse' : 'text-cyan-500'}">
      {loading ? 'PROCESSING' : 'READY'}
    </div>
  </div>

  <!-- Body -->
  <div class="p-6 space-y-6">
    {#each fields as field}
      <div class="space-y-2">
        <label for={field.id} class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {field.label}
          {#if field.required}<span class="text-red-500 ml-1">*</span>{/if}
        </label>
        <div class="relative">
          {#if field.type === 'textarea'}
            <textarea
              id={field.id}
              bind:value={formData[field.id]}
              oninput={(e) => handleInput(field.id, (e.currentTarget as HTMLTextAreaElement).value)}
              disabled={loading || field.disabled}
              placeholder={field.placeholder}
              class="w-full bg-slate-800 border {errors[field.id] ? 'border-red-500' : 'border-slate-700'} rounded p-3 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none transition-all min-h-[100px]"></textarea>
          {:else if field.type === 'select'}
            <select
              id={field.id}
              bind:value={formData[field.id]}
              onchange={(e) => handleInput(field.id, (e.currentTarget as HTMLSelectElement).value)}
              disabled={loading || field.disabled}
              class="w-full bg-slate-800 border {errors[field.id] ? 'border-red-500' : 'border-slate-700'} rounded p-3 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none appearance-none">
              <option value="">{field.placeholder || 'Select...'}</option>
              {#each field.options || [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if field.type === 'checkbox'}
            <label class="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                id={field.id}
                bind:checked={formData[field.id]}
                onchange={(e) => handleInput(field.id, (e.currentTarget as HTMLInputElement).checked)}
                disabled={loading || field.disabled}
                class="w-4 h-4 bg-slate-800 border-slate-700 rounded text-cyan-600 focus:ring-cyan-500" />
              <span class="text-xs text-slate-400 group-hover:text-slate-200 transition-colors uppercase font-mono">
                {field.placeholder || 'Enable'}
              </span>
            </label>
          {:else}
            <input
              id={field.id}
              type={field.type}
              bind:value={formData[field.id]}
              oninput={(e) => handleInput(field.id, (e.currentTarget as HTMLInputElement).value)}
              disabled={loading || field.disabled}
              placeholder={field.placeholder}
              class="w-full bg-slate-800 border {errors[field.id] ? 'border-red-500' : 'border-slate-700'} rounded p-3 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none transition-all" />
          {/if}
        </div>
        {#if errors[field.id] && touched[field.id]}
          <p class="text-[10px] text-red-400 font-mono tracking-tighter uppercase">
            [ERROR]: {errors[field.id]}
          </p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Footer -->
  <div class="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
    <div class="flex gap-4 text-[9px] font-mono text-slate-600 uppercase">
      <span>Ctrl+Enter Submit</span>
      <span>Esc Abort</span>
    </div>
    <div class="flex gap-3">
      {#if showCancel}
        <button
          onclick={oncancel}
          disabled={loading}
          class="px-4 py-2 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 text-[10px] font-bold tracking-widest uppercase transition-all">
          {cancelLabel}
        </button>
      {/if}
      <button
        onclick={handleSubmit}
        disabled={loading}
        class="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-bold tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(8,145,178,0.2)]">
        {loading ? 'EXECUTING...' : submitLabel}
      </button>
    </div>
  </div>
</div>






