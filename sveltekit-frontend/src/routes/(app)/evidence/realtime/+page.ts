// Dialog SSR safety: bits-ui Dialog triggers TDZ in Svelte 5.46.0 SSR.
// This page renders Dialog.Root for the New Case modal. Realtime evidence
// stream is client-driven (WebSocket / SSE) so SSR was already low-value;
// turning it off explicitly avoids the bits-ui hydration crash. Matches the
// pattern used in (app)/persons-of-interest/+page.ts.
export const ssr = false;
