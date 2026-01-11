/**
 * XState Detective Mode
 *
 * This module provides a simple way to enable and disable the XState inspector
 * for debugging state machines in a development environment.
 *
 * Usage:
 * In your root layout component (e.g., +layout.svelte):
 *
 * import { onMount } from 'svelte';
 * import { enableDetectiveMode } from '$lib // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5/state/xstate-detective-mode';
 *
 * onMount(() => {
 * enableDetectiveMode();
 * });
 */
import { browser } from '$app // TODO: Verify store subscription is correct for Svelte 5 // TODO: Verify store subscription is correct for Svelte 5/environment';

let inspector;
/**
 * Enables the XState inspector if in a browser and development environment.
 * This will open an iframe with the XState visualizer.
 *
 * NOTE: This requires the `@xstate/inspect` package to be installed as a dev dependency.
 *
 * @param {object} options - Optional options to pass to the inspector.
 * @see https://xstate.js.org/docs/packages/xstate-inspect/
 */
export async function enableDetectiveMode(options = {}) {
 if (browser && import.meta.env.DEV && !inspector) {
 try {
 const { inspect } = await import('@xstate/inspect');
 inspector = inspect({
 iframe: () => {
 const iframe = document.createElement('iframe');
 iframe.id = 'xstate-inspector-iframe';
 iframe.style.position = 'fixed';
 iframe.style.bottom = '1rem';
 iframe.style.right = '1rem';
 iframe.style.width = '450px';
 iframe.style.height = '600px';
 iframe.style.zIndex = '9999';
 iframe.style.border = '1px solid #ccc';
 iframe.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
 iframe.style.borderRadius = '8px';
 document.body.appendChild(iframe);
 return iframe;
 },
 ...options,
 });
 console.log('ðŸ•µï¸ XState Detective Mode enabled. Inspector is running.');
 } catch (e) {
 console.error('Failed to enable XState Detective Mode. Is "@xstate/inspect" installed?', e);
 }
 }
}

/**
 * Disables and disconnects the XState inspector.
 */
export function disableDetectiveMode() {
 if (inspector) {
 inspector.disconnect();
 const iframe = document.getElementById('xstate-inspector-iframe');
 if (iframe) {
 iframe.remove();
 }
 inspector = undefined;
 console.log('ðŸ•µï¸ XState Detective Mode disabled.');
 }
}

/**
 * Toggles the XState inspector on or off.
 * @param {object} options - Optional options to pass to the inspector.
 */
export function toggleDetectiveMode(options = {}) {
 if (inspector) {
 disableDetectiveMode();
 } else {
 enableDetectiveMode(options);
 }
}

