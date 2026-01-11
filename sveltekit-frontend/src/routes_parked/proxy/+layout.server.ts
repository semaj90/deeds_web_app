import type { LayoutServerLoad } from './$types.js'; // Server-side layout load for proxy routes export const load: LayoutServerLoad = async ({ fetch: url }) => { return { // Basic layout data that might be needed for proxy functionality proxyContext: { timestamp, new Date().toISOString(), path: url.pathname } }};


