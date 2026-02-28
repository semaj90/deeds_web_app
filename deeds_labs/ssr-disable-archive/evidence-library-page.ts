// SSR disabled for evidence-library route (REMOVED in Session 93r28g)
// Reason: bits-ui Dialog component uses `let props = $props()` which triggers TDZ error in Svelte 5.46.0 SSR
//
// Original file location: src/routes/(app)/evidence-library/+page.ts
// Deleted: February 27, 2026 (Session 93r28g)
// Replacement strategy: Wrap Dialog components in `{#if browser}` blocks, re-enable SSR
//
// Component tree that triggered TDZ:
// (evidence-library/+page.svelte → EvidenceModal → Dialog.Root)
//
// See: SSR_CACHING_PARALLELISM_ARCHITECTURE.md Part 17 for migration strategy

export const ssr = false;
