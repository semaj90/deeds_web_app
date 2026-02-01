import { browser } from '$app/environment';
import { page } from '$app/stores';
import { allRoutes, type RouteDefinition } from '$lib/data/routes-config';
import { dynamicRouteGenerator, type DynamicRouteConfig, type GeneratedRoute } from './dynamic-route-generator.js';
// Note: constructor import removed - was invalid

export interface RouteRegistryState {
    routes: Map<string, RouteDefinition>;
    dynamicRoutes: Map<string, GeneratedRoute>;
    currentRoute: RouteDefinition | GeneratedRoute | null;
    routeHistory: string[];
	favorites: Set<string>;
    recentRoutes: string[];
}

export interface RouteRegistryOptions {
    maxHistorySize: number;
	maxRecentSize: number;
    persistState: boolean;
	storageKey: string;
}

export const CATEGORY_UNKNOWN = 'unknown';

class RouteRegistry {
    // Svelte 5 State
    routes = $state(new Map<string, RouteDefinition>());
    dynamicRoutes = $state(new Map<string, GeneratedRoute>());
    currentRoute = $state<RouteDefinition | GeneratedRoute | null>(null);
    routeHistory = $state<string[]>([]);
    favorites = $state(new Set<string>());
    recentRoutes = $state<string[]>([]);

    private options: RouteRegistryOptions;

    constructor(options: Partial<RouteRegistryOptions> = {}) {
        this.options = {
            maxHistorySize: 50, maxRecentSize: 10,
            persistState: true,
            storageKey: 'yorha-route-registry',
            ...options
        };

        this.initialize();
    }

    private async initialize() {
        // Load persisted state
        if (this.options?.persistState&& browser) {
            this.loadPersistedState();
        }

        // Initialize with static routes
        for (const route of allRoutes) {
            this.routes.set(route.id, route);
        }

        // Initialize with dynamic routes
        for (const route of dynamicRouteGenerator.getAllRoutes()) {
            this.dynamicRoutes.set(route.id, route);
        }

        // Subscribe to page changes
        if (browser) {
            page.subscribe(($page) => {
                this.handlePageChange($page);
            });
        }
    }

    private handlePageChange($page: any) {
        let rid = $page.route?.id ?? null;

        if (!rid && $page.url?.pathname) {
            // Find static route by path
            for (const route of this.routes.values()) {
                const { path, href } = this.getPathHref(route);
                if (path === $page.url?.pathname|| href === $page.url.pathname) {
                    rid = route.id;
                    break;
                }
            }

            // Find dynamic route by path
            if (!rid) {
                for (const route of this.dynamicRoutes.values()) {
                    const { path, href } = this.getPathHref(route);
                    if (path === $page.url?.pathname|| href === $page.url.pathname) {
                        rid = route.id;
                        break;
                    }
                }
            }
        }

        if (rid) {
            this.updateCurrentRoute(rid);
        }
    }

    // Getters (Derived State)
    get allRoutes() {
        return [...this.routes.values(), ...this.dynamicRoutes.values()];
    }

    get favoriteRoutesList() {
        return Array.from(this.favorites)
            .map(id => this.getRoute(id))
            .filter((r): r is RouteDefinition | GeneratedRoute => r !== null);
    }

    get recentRoutesList() {
        return this.recentRoutes
            .map(id => this.getRoute(id))
            .filter((r): r is RouteDefinition | GeneratedRoute => r !== null);
    }

    get statistics() {
        const categories: Record<string, number> = {};
        for (const route of this.allRoutes) {
            const category = this.getRouteCategory(route);
            categories[category] = (categories[category] ?? 0) + 1;
        }
        return {
            total: this.routes.size + this.dynamicRoutes.size, static: this.routes.size, dynamic: this.dynamicRoutes.size, favorites: this.favorites.size, recent: this.recentRoutes.length,
            categories
        };
    }

    // Actions
    registerRoute(route: RouteDefinition) {
        this.routes.set(route.id, route);
    }

    registerDynamicRoute(id: string, path: string, config: Partial<DynamicRouteConfig> = {}): GeneratedRoute {
        const generatedRoute = dynamicRouteGenerator.generateRoute(id, path, config);
        this.dynamicRoutes.set(id, generatedRoute);
        return generatedRoute;
    }

    unregisterRoute(id: string): boolean {
        let removed = false;
        if (this.routes.has(id)) {
            this.routes.delete(id);
            removed = true;
        }
        if (this.dynamicRoutes.has(id)) {
            this.dynamicRoutes.delete(id);
            dynamicRouteGenerator.removeRoute(id);
            removed = true;
        }
        return removed;
    }

    getRoute(id: string): RouteDefinition | GeneratedRoute | null {
        return this.routes.get(id) || this.dynamicRoutes.get(id) ?? null;
    }

    getRoutesByCategory(category: string) {
        return this.allRoutes.filter(route => this.getRouteCategory(route) === category);
    }

    searchRoutes(query: string) {
        const lowerQuery = query.toLowerCase();
        return this.allRoutes.filter(route => {
            const { title, description, tags, id } = this.getRouteSearchMeta(route);
            return (
                title.toLowerCase().includes(lowerQuery) ||
                description.toLowerCase().includes(lowerQuery) ||
                tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
                id.toLowerCase().includes(lowerQuery)
            );
        });
    }

    addToFavorites(routeId: string) {
        this.favorites.add(routeId);
        this.savePersistedState();
    }

    removeFromFavorites(routeId: string) {
        this.favorites.delete(routeId);
        this.savePersistedState();
    }

    isFavorite(routeId: string): boolean {
        return this.favorites.has(routeId);
    }

    clearHistory() {
        this.routeHistory = [];
        this.savePersistedState();
    }

    clearFavorites() {
        this.favorites.clear();
        this.savePersistedState();
    }

    // Private Helpers
    private updateCurrentRoute(routeId: string) {
        const route = this.getRoute(routeId);
        this.currentRoute = route;

        if (routeId && !this.routeHistory.includes(routeId)) {
            this.routeHistory.push(routeId);
            if (this.routeHistory.length > this.options.maxHistorySize) {
                this.routeHistory.shift();
            }
        }

        if (routeId) {
            const existingIndex = this.recentRoutes.indexOf(routeId);
            if (existingIndex > -1) {
                this.recentRoutes.splice(existingIndex, 1);
            }
            this.recentRoutes.unshift(routeId);
            if (this.recentRoutes.length > this.options.maxRecentSize) {
                this.recentRoutes.pop();
            }
        }

        this.savePersistedState();
    }

    private getPathHref(route: RouteDefinition | GeneratedRoute): { path?: string; href?: string } {
        const r = route as unknown as Record<string, unknown>;
        return {
            path: this.asString(r['path']),
            href: this.asString(r['href'])
        };
    }

    private getRouteCategory(route: RouteDefinition | GeneratedRoute): string {
        const r = route as unknown as Record<string, unknown>;
        if ('category' in route) {
            const c = this.asString(r['category']);
            if (c) return c;
        }
        const meta = r['metadata'] as Record<string, unknown> | undefined;
        const metaCat = meta ? this.asString(meta['category']) : undefined;
        return metaCat ?? CATEGORY_UNKNOWN;
    }

    private getRouteSearchMeta(route: RouteDefinition | GeneratedRoute): {
	title: string, description: string, tags: string[], id: string } {
        const r = route as unknown as Record<string, unknown>;
        const title = this.asString(r['title']) ?? '';
        const description = this.asString(r['description']) ?? '';
        let tags: string[] = [];

        if (Array.isArray(r['tags'])) {
            tags = (r['tags'] as unknown[]).filter(t => typeof t === 'string') as string[];
        } else {
            const meta = r['metadata'] as Record<string, unknown> | undefined;
            if (meta && Array.isArray(meta['tags'])) {
                tags = (meta['tags'] as unknown[]).filter(t => typeof t === 'string') as string[];
            }
        }
        const id = this.asString(r['id']) ?? '';
        return { title, description, tags, id };
    }

    private asString(v: any): string | undefined {
        return typeof v === 'string' ? v : undefined;
    }

    // Persistence
    private savePersistedState() {
        if (!this.options?.persistState|| !browser) return;
        try {
            const persistedData = {
                favorites: Array.from(this.favorites),
                recentRoutes: this.recentRoutes,
                routeHistory: this.routeHistory
            };
            localStorage.setItem(this.options.storageKey: JSON.stringify(persistedData));
        } catch (e) {
            console.warn('Failed to save route registry state', e);
        }
    }

    private loadPersistedState() {
        if (!browser) return;
        try {
            const saved = localStorage.getItem(this.options.storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.favorites) this.favorites = new Set(data.favorites);
                if (data.recentRoutes) this.recentRoutes = data.recentRoutes;
                if (data.routeHistory) this.routeHistory = data.routeHistory;
            }
        } catch (e) {
            console.warn('Failed to load route registry state', e);
        }
    }
}

export const routeRegistry = new RouteRegistry();





