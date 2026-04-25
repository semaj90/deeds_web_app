/**
 * Re-export canonical user store (Svelte 5 runes).
 * The real implementation lives in $lib/stores/user.svelte.ts
 * This file exists for backward compatibility with auth/ imports.
 */
export { userStore, type UserSession } from '$lib/stores/user.svelte';
