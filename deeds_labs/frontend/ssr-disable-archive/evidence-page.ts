// SSR disabled for evidence route (REMOVED in Session 93r28g)
// Reason: bits-ui Dialog components use `let props = $props()` which triggers TDZ error in Svelte 5.46.0 SSR
//
// Original file location: src/routes/(app)/evidence/+page.ts
// Deleted: February 27, 2026 (Session 93r28g)
// Replacement strategy: Wrap Dialog components in `{#if browser}` blocks, re-enable SSR
//
// Components that triggered TDZ:
// - DocumentDetailModal → Dialog.Root
// - EvidenceCRUDModal → Dialog.Root
// - EvidenceAssistant → Dialog.Root
// - LegalAnalysisDialog → Dialog.Root
//
// See: SSR_CACHING_PARALLELISM_ARCHITECTURE.md Part 17 for migration strategy

export const ssr = false;
