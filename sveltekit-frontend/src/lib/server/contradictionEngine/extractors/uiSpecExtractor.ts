import type { RouteSpecInput, UISpec } from '../types.js';

export async function extractUISpec(route: RouteSpecInput): Promise<UISpec> {
    return {
        route: route.route,
        requiredTokens: route.tokens || [],
        requiredComponents: route.components || [],
        layoutGrid: route.gridRules || {
            columns: 12,
            gap: 16
        },
        spacing: route.spacing || {},
        colorRules: route.colors || {},
        screenshotHash: route.hash || 'placeholder-hash',
        minimumScore: route.minimumScore || 85,
    };
}
