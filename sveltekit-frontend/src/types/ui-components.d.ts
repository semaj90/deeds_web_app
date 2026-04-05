/**
 * Provide loose typings for local UI components to avoid strict
 * SvelteComponentTyped mismatches. Makes imports like
 * `import Button from '$lib/components/ui/Button.svelte'` type as a component constructor.
 */

declare module '$lib/components/ui/*' {
	import type { SvelteComponentTyped } from 'svelte';
	const Component: new (...args: unknown[]) => SvelteComponentTyped<
		Record<string, any>,
		Record<string, any>,
		Record<string, unknown>
	>;
	export default Component;
}

declare module '$lib/components/ui/*/*' {
	import type { SvelteComponentTyped } from 'svelte';
	const Component: new (...args: unknown[]) => SvelteComponentTyped<
		Record<string, any>,
		Record<string, any>,
		Record<string, unknown>
	>;
	export default Component;
}

declare module '$lib/components/ui/*/*/*' {
	import type { SvelteComponentTyped } from 'svelte';
	const Component: new (...args: unknown[]) => SvelteComponentTyped<
		Record<string, any>,
		Record<string, any>,
		Record<string, unknown>
	>;
	export default Component;
}
