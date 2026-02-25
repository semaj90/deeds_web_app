// SSR disabled — bits-ui Dialog component uses un-destructured $props()
// which triggers TDZ error in Svelte 5.46.0 SSR renderer
// (evidence/+page.svelte → DocumentDetailModal → Dialog.Root)
export const ssr = false;
