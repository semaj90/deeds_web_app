// Disable SSR for command-center route
// bits-ui ScrollArea uses `let props = $props()` which triggers TDZ error in Svelte 5.46.0 SSR
export const ssr = false;