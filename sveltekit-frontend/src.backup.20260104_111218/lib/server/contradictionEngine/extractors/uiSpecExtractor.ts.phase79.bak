import type { RouteSpecInput, UISpec } from '../types.js';

export async function extractUISpec(route: RouteSpecInput): Promise<UISpec> {
 return {
 route: route.route,
 requiredTokens: route.tokens,
 requiredComponents: route.components,
 layoutGrid: route.gridRules,
 spacing: route.spacing,
 colorRules: route.colors,
 screenshotHash: route.hash,
 minimumScore: route.minimumScore ?? 85,
 };
}
