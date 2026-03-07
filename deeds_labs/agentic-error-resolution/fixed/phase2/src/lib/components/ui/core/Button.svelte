<script lang="ts">
  
  interface Props {
    // Minimal, dependency-free Button component.
    disabled?: boolean;
    onclick: ((e: Event) => void) | undefined; // Allow consumers to pass class, aria-*, data-*, etc. via $$restProps
    children?: import('svelte').Snippet;
    [key: string]: any
  }

  let { disabled = false, onclick, children, ...rest }: Props = $props();

  
  // (Svelte forwards those to the root element below).
</script>

<button {...rest} {onclick} {disabled} class="ui-button">
  {@render children?.()}
</button>

<style>
  .ui-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: var(--btn-bg, #0ea5e9);
    color: var(--btn-fg, #fff);
    cursor: pointer;
    font-weight: 600;
  }
  .ui-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
