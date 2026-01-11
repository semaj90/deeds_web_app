<script lang="ts">
  // Basic Select wrapper that uses enhanced-bits Select
  import EnhancedSelect from '$lib/enhanced-bits/Select.svelte';
  interface SelectOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
    category?: string;
  }
  let {
    value = $bindable(''),
    options = [] as SelectOption[],
    placeholder = 'Select...',
    ...props
  }: {
    value?: string;
    options?: SelectOption[];
    placeholder?: string;
    [key: string]: any;
  } = $props();
</script>

<EnhancedSelect {value} {options} {placeholder} {...props} />
