/**
 * Root svelte.config.js — delegates to sveltekit-frontend
 * (This file exists only to satisfy workspace-level svelte-check;
 *  the real config is in sveltekit-frontend/svelte.config.js)
 */

// Re-export the actual config from sveltekit-frontend
export { default } from './sveltekit-frontend/svelte.config.js';
