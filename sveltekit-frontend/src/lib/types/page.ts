// Type definitions for SvelteKit page data
export type Props = {
 data: { availableRoutes: Array<{ path: string; icon?: string; description?: string }>;
 routeInventory?: { fileRoutesSample: Array<{ route: string; title: string }>;
 };
 };
};

// Add other page-specific types here if needed in the future



