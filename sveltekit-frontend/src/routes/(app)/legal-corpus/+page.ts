// Dialog SSR safety: bits-ui Dialog triggers TDZ in Svelte 5.46.0 SSR.
// This page renders Dialog.Root for the statute detail modal (line ~210 of
// +page.svelte). +page.server.ts still loads statutes/glossary on the server;
// only the Svelte component renders client-side, matching the pattern used
// in (app)/persons-of-interest/+page.ts and (app)/cases/[id]/reports/+page.ts.
export const ssr = false;
