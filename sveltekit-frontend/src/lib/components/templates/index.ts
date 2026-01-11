/**
 * Svelte 5 + bits-ui v2.x Component Templates
 *
 * These templates demonstrate the recommended patterns for:
 * - Svelte 5 runes ($props, $state, $derived, $effect, $bindable)
 * - bits-ui v2.14.4+ (native runes, no Melt UI)
 * - UnoCSS NES theme styling
 * - Snippet-based slots for composition
 * - Full TypeScript support
 *
 * @module templates
 */

// Dialog - Modal dialogs with Portal support
export { default as Svelte5BitsDialog } from './Svelte5BitsDialog.svelte';

// Card - Content containers with variants
export { default as Svelte5Card } from './Svelte5Card.svelte';

// Button - Interactive buttons with loading states
export { default as Svelte5Button } from './Svelte5Button.svelte';

/**
 * Migration Guide: Svelte 4 → Svelte 5 + bits-ui v2.x
 *
 * | Svelte 4 Pattern          | Svelte 5 Pattern              |
 * |---------------------------|-------------------------------|
 * | export let prop           | let { prop } = $props()       |
 * | $: derived = expr         | let derived = $derived(expr)  |
 * | let state = value         | let state = $state(value)     |
 * | bind:value                | bind:value (still works)      |
 * | export let value          | let { value = $bindable() }   |
 * | <slot />                  | {#if children}{@render children()}{/if} |
 * | <slot name="x" />         | {#if x}{@render x()}{/snippet} |
 * | onclick                  | onclick                       |
 * | createEventDispatcher     | callback props                |
 * | afterUpdate/beforeUpdate  | $effect()                     |
 * | onMount/onDestroy         | $effect() with cleanup        |
 *
 * bits-ui v2.x Changes:
 * - No more Melt UI dependency
 * - Uses runes internally
 * - Compound component pattern (Dialog.Root, Dialog.Content, etc.)
 * - bind:open works directly with $state
 */


