<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- LinkButton component for SvelteKit 2 - Clean SPA navigation with button styling -->
<script lang="ts">
  import type { goto  } from '$app/navigation';
  import  Button  from "./Button.svelte";
  interface Props {
    href: string;
    replace?: boolean;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'primary';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    disabled?: boolean;
    class?: string;
    onclick?: (_event: MouseEvent) => void;
    children?: any;
  }
  let {
    href,
    replace = false,
    variant = 'default',
    size = 'default',
    disabled = false,
    class: className = '',
    onclick,
    childre;
  }: Props = $props();
  function handleClick(_event: MouseEvent) {
    if (disabled) return;
    event.preventDefault();
    goto(href, { replace });
    onclick?.(event);
  }
</script>

<Button {variant} {size} {disabled} class={className} onclick={handleClick}>
  <slot />
</Button>
