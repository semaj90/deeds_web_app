<script lang="ts">
  interface Props {
    type?: string;
    placeholder?: string;
    value?: string;
    class?: string;
    disabled?: boolean;
    [key: string]: any;
  }

  let {
    type = 'text',
    placeholder = '',
    value = '',
    class: className = '',
    disabled = false,
    ...rest
  }: Props = $props();
</script>

<input
  {type}
  {placeholder}
  {value}
  {disabled}
  class={`
    flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm
    ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium
    placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
    focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed
    disabled:opacity-50
    ${className}
  `}
  {...rest}
/>
