<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    name?: string;
    value?: string;
    ariaLabel?: string;
    class?: string;
  }
  let {
    checked = $bindable(false),
    disabled = false,
    id = undefined,
    name = undefined,
    value = undefined,
    ariaLabel = undefined,
    class: className = '',
  }: Props = $props();
</script>

<input
  type="checkbox"
  {id}
  {name}
  {value}
  bind:checked
  {disabled}
  aria-label={ariaLabel}
  class={'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:opacity-50, disabled:cursor-not-allowed, ' +
    className}
/>
