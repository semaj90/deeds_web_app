/**
 * Route Registry for Dynamic Route Management
 * Centralized registry for all application routes
 */

// Session 63: Removed svelte/store dependency — plain TS state with subscribe contract
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
    routeHistory: string[];
	favorites: Set<string>;
    recentRoutes: string[];
}

/**
 * Route Registry Options interface
 */
export interface RouteRegistryOptions {
    maxHistorySize: number;
	maxRecentSize: number;
    persistState: boolean;
	storageKey: string;
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
    private _state: RouteRegistryState = {
        routes: new Map(),
        dynamicRoutes: new Map(),
        currentRoute: null,
        routeHistory: [],
        favorites: new Set(),
        recentRoutes: []
    };
    private subscribers = new Set<(v: RouteRegistryState) => void>();
    private options: RouteRegistryOptions;

    constructor(options: Partial<RouteRegistryOptions> = {}) {
        this.options = {
            maxHistorySize: 50,
            maxRecentSize: 10,
            persistState: true,
            storageKey: 'yorha-route-registry',
            ...options
        };
        this.initialize();
    }

    private async initialize(): Promise<void> {
        if (this.options.persistState && typeof window !== 'undefined') {
            await this.loadPersistedState();
        }

        for (const route of allRoutes) {
            this._state.routes.set(route.id, route);
        }
        for (const route of dynamicRouteGenerator.getAllRoutes()) {
            this._state.dynamicRoutes.set(route.id, route);
        }
        this.notify();
    }

    private async loadPersistedState(): Promise<void> {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(this.options.storageKey);
            if (stored) { /* restore logic placeholder */ }
        } catch (e) {
            console.warn('Failed to load persisted route state', e);
        }
    }

    private notify(): void {
        this.subscribers.forEach(fn => fn(this._state));
    }

    /** Svelte store contract — allows $routeRegistry auto-subscription */
    subscribe(fn: (v: RouteRegistryState) => void): () => void {
        this.subscribers.add(fn);
        fn(this._state);
        return () => { this.subscribers.delete(fn); };
    }

    get state(): RouteRegistryState { return this._state; }

    public getCategory(route: RouteDefinition | GeneratedRoute): string {
        return (route as any).categoryId ?? (route as any).category ?? CATEGORY_UNKNOWN;
    }

} // end class RouteRegistry

// Singleton
export const routeRegistry = new RouteRegistry();

// Convenience getters (replace derived stores)
export function getRoutes(): RouteDefinition[] {
    return Array.from(routeRegistry.state.routes.values());
}
export function getDynamicRoutes(): GeneratedRoute[] {
    return Array.from(routeRegistry.state.dynamicRoutes.values());
}
export function getAllRegisteredRoutes(): (RouteDefinition | GeneratedRoute)[] {
    return [...getRoutes(), ...getDynamicRoutes()];
}
export function getCurrentRoute(): RouteDefinition | GeneratedRoute | null {
    return routeRegistry.state.currentRoute;
}
export function getRouteStatistics() {
    const s = routeRegistry.state;
    const categories: Record<string, number> = {};
    for (const route of getAllRegisteredRoutes()) {
        const cat = routeRegistry.getCategory(route);
        categories[cat] = (categories[cat] ?? 0) + 1;
    }
    return {
        total: s.routes.size + s.dynamicRoutes.size,
        static: s.routes.size,
        dynamic: s.dynamicRoutes.size,
        favorites: s.favorites.size,
        recent: s.recentRoutes.length,
        categories
    };
}
