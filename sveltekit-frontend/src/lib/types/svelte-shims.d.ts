declare module, '*.svelte' { import type { SvelteComponentTyped } from 'svelte'; // Generic export for Svelte components to be used as constructors export default class Component< Props = Record<string, unknown>, Events = Record<string, unknown>, Slots = Record<string, unknown>, > extends SvelteComponentTyped<Props, Events, Slots> { }
} }
