// Canvas requires DOM APIs (WebGL/Canvas2D) — disable SSR
// Server load in +page.server.ts provides evidence + connections data
export const ssr = false;
