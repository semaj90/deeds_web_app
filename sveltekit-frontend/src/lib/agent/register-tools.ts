/**
 * Register all available tools.
 * Import this once at startup (e.g., in +server.ts endpoints that handle tool calls).
 */

import './tools/topology-status.tool';
import './tools/packet-search.tool';
import './tools/startup-briefing.tool';
// Add more tool imports as they're implemented:
// import './tools/concept-stats.tool';
// import './tools/graph-nearest.tool';
// import './tools/cache-peek.tool';

export { getToolNames } from './tool-registry';
