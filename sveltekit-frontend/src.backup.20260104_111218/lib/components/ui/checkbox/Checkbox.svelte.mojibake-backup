<script lang="ts">
  interface Props {
    checked?: boolean;
    class?: string;
    disabled?: boolean;
    [key: string]: any;
  }

  let {
    checked = false,
    class: className = '',
    disabled = false,
    ...rest
  }: Props = $props();
</script>

<input
  type="checkbox"
  {checked}
  {disabled}
  class={`
    peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
    focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
    data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground
    ${className}
  `}
  {...rest}
/>
