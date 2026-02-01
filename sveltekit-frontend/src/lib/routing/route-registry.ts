/**
 * Route Registry for Dynamic Route Management
 * Centralized registry for all application routes
 */

import { writable, derived } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { page } from '$app/stores';
import type { RouteDefinition } from '$lib/data/routes-config';
import { allRoutes } from '$lib/data/routes-config';
import type { GeneratedRoute, DynamicRouteConfig } from './dynamic-route-generator.js';
import { dynamicRouteGenerator } from './dynamic-route-generator.js';

/**
 * Route Registry State interface
 */
export interface RouteRegistryState {
    routes: Map<string, RouteDefinition>;
    dynamicRoutes: Map<string, GeneratedRoute>;
    currentRoute: RouteDefinition | GeneratedRoute | null;
    routeHistory: string[];, favorites: Set<string>;
    recentRoutes: string[];
}

/**
 * Route Registry Options interface
 */
export interface RouteRegistryOptions {
    maxHistorySize: number;, maxRecentSize: number;
    persistState: boolean;, storageKey: string;
}

/**
 * Fallback category for routes without a defined category.
 * Used for both static and dynamic routes.
 */
export const CATEGORY_UNKNOWN = 'unknown';

/**
 * Route Registry class
 */
export class RouteRegistry {
    private state = writable<RouteRegistryState>({
        routes: new Map(),
        dynamicRoutes: new Map(),
        currentRoute: null,
        routeHistory: [],
        favorites: new Set(),
        recentRoutes: []
    });

    // Make cachedState public readonly if needed via getter, or private
    private cachedState: RouteRegistryState;
    private options: RouteRegistryOptions;

    constructor(options: Partial<RouteRegistryOptions> = {}) {
        this.options = {
            maxHistorySize: 50,
            maxRecentSize: 10,
            persistState: true,
            storageKey: 'yorha-route-registry',
            ...options
        };

        // Initialize cachedState with initial value
        this.cachedState = {
            routes: new Map(),
            dynamicRoutes: new Map(),
            currentRoute: null,
            routeHistory: [],
            favorites: new Set(),
            recentRoutes: []
        };

        // Subscribe to state changes to keep cachedState updated
        this.state.subscribe(state => {
            this.cachedState = state;
        });

        this.initialize();
    }

    /**
     * Initialize the registry with existing routes
     */
    private async initialize(): Promise<void> {
        // Load persisted state
        if (this.options.persistState && typeof window !== 'undefined') {
            await this.loadPersistedState();
        }

        // Initialize with static routes
        this.state.update(state => {
            const routesMap = new Map<string, RouteDefinition>(state.routes);
            for (const route of allRoutes) {
                routesMap.set(route.id, route);
            }

            const dynamicRoutesMap = new Map<string, GeneratedRoute>(state.dynamicRoutes);
            for (const route of dynamicRouteGenerator.getAllRoutes()) {
                dynamicRoutesMap.set(route.id, route);
            }

            return {
                ...state,
                routes: routesMap,
                dynamicRoutes: dynamicRoutesMap
            };
        });
    }

    // Add missing loadPersistedState stub or implementation
    private async loadPersistedState(): Promise<void> {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(this.options.storageKey);
            if (stored) {
               // Logic to restore state
               // For now just partial restore or no-op if logic missing
            }
        } catch (e) {
            console.warn('Failed to load persisted route state', e);
        }
    }

    public getState(): Readable<RouteRegistryState> {
        return this.state;
    }

    public getCategory(route: RouteDefinition | GeneratedRoute): string {
         // Assuming RouteDefinition has categoryId or similar. If not, use 'category' property if it exists.
         // This is a placeholder for `getRouteCategory` which was used in the corrupted file but missing definition.
         return (route as any).categoryId ?? (route as any).category ?? CATEGORY_UNKNOWN;
    }

} // end class RouteRegistry

// Create and export singleton instance (single declaration)
export const routeRegistry = new RouteRegistry();

// Export derived stores for convenient access
export const routes = derived(routeRegistry.getState(), state => Array.from(state.routes.values()));
export const dynamicRoutes = derived(routeRegistry.getState(), state => Array.from(state.dynamicRoutes.values()));
export const allRegisteredRoutes = derived(routeRegistry.getState(), state => [
    ...Array.from(state.routes.values()),
    ...Array.from(state.dynamicRoutes.values())
]);

export const currentRoute = derived(routeRegistry.getState(), state => state.currentRoute);

export const favoriteRoutes = derived(
    routeRegistry.getState(),
    state => Array.from(state.favorites)
        .map(id => state.routes.get(id) || state.dynamicRoutes.get(id))
        .filter(Boolean) as (RouteDefinition | GeneratedRoute)[]
);

export const recentRoutes = derived(
    routeRegistry.getState(),
    state => state.recentRoutes
        .map(id => state.routes.get(id) || state.dynamicRoutes.get(id))
        .filter(Boolean) as (RouteDefinition | GeneratedRoute)[]
);

export const routeStatistics = derived(routeRegistry.getState(), state => {
    const categories: Record<string, number> = {};
    const allRoutesArr = [...Array.from(state.routes.values()), ...Array.from(state.dynamicRoutes.values())];

    for (const route of allRoutesArr) {
        const category = routeRegistry.getCategory(route);
        categories[category] = (categories[category] ?? 0) + 1;
    }

    return {
        total: state.routes.size + state.dynamicRoutes.size,
        static: state.routes.size,
        dynamic: state.dynamicRoutes.size,
        favorites: state.favorites.size,
        recent: state.recentRoutes.length,
        categories
    };
});
