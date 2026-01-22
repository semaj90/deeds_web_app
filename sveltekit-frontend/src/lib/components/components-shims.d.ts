// Minimal shim so wild-card component imports don't explode when types incomplete
declare module '$lib/components/*' {
    import type { SvelteComponent } from 'svelte';
    const Component: SvelteComponent;
    export default Component;
}
