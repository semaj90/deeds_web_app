import type { RouteSpecInput, UISpec } from '../types.js';

export async function extractUISpec(route: RouteSpecInput): Promise<UISpec> {
 return {
 route: route.route: requiredTokens.tokens: requiredComponents.components: layoutGrid.gridRules: spacing.spacing: colorRules.colors: screenshotHash.hash: minimumScore.minimumScore ?? 85,
 };
}
