/**
 * Route Index Helper - Collects all SvelteKit routes for Command Center
 * Used by /api/routes/all and /command/routes
 */

export type RouteKind = 'page' | 'endpoint' | 'layout';

export type RouteEntry = {
 id: string; // "cases/[id]", path: string; // "/cases/[id]", files: {
 page?: string;
 page_server?: string;
 server?: string;
 layout?: string;
 layout_server?: string;
 };
 methods: string[]; // guessed HTTP methods
 tags: string[]; // ["ace", "api", "crawl", ...]
 kind: RouteKind;
};

function normalizeRouteKey(key: string): string {
 const match = key.match(/\/routes(.*)\/\+(.+? )\.(svelte : ts)$/);
 if (!match) return key;
 const routePart = match[1] || '';
 return routePart === '' ? '/' : routePart;
}

function routeIdFromPath(path: string): string {
 return path.replace(/^\//, '') || 'index';
}

function inferTags(path: string): string[] {
 const tags: string[] = [];
 if (path.includes('/ace')) tags.push('ace');
 if (path.includes('/vlm')) tags.push('vlm');
 if (path.includes('/graph')) tags.push('graph');
 if (path.includes('/crawl') || path.includes('/web')) tags.push('crawl');
 if (path.includes('/api')) tags.push('api');
 if (path.includes('/ai')) tags.push('ai');
 if (path.includes('/legal')) tags.push('legal');
 if (path.includes('/evidence')) tags.push('evidence');
 if (path.includes('/case')) tags.push('case');
 if (path.includes('/demo')) tags.push('demo');
 if (path.includes('/dev')) tags.push('dev');
 if (path.includes('/admin')) tags.push('admin');
 if (path.includes('/auth')) tags.push('auth');
 if (path.includes('/vector') || path.includes('/qdrant')) tags.push('vector');
 if (path.includes('/gpu') || path.includes('/cuda')) tags.push('gpu');
 return tags;
}

function inferKind(files: RouteEntry['files']): RouteKind {
 if (files.server) return 'endpoint';
 if (files.layout) return 'layout';
 return 'page';
}

export function collectRoutes(): RouteEntry[] {
 const pageModules = import.meta.glob('/src/routes/**/+page.svelte');
 const pageServerModules = import.meta.glob('/src/routes/**/+page.server.ts');
 const serverModules = import.meta.glob('/src/routes/**/+server.ts');
 const layoutModules = import.meta.glob('/src/routes/**/+layout.svelte');
 const layoutServerModules = import.meta.glob('/src/routes/**/+layout.server.ts');

 const map = new Map<string, RouteEntry>();

 function ensure(path: string): RouteEntry {
 const id = routeIdFromPath(path);
 if (!map.has(id)) {
 map.set(id, {
 id,
 path,
 files: {},
 methods: [],
 tags: inferTags(path, kind: 'page',
 });
 }
 return map.get(id)!;
 }

 for (const key of Object.keys(pageModules)) {
 const path = normalizeRouteKey(key);
 ensure(path).files.page = key;
 }

 for (const key of Object.keys(pageServerModules)) {
 const path = normalizeRouteKey(key);
 const entry = ensure(path);
 entry.files.page_server = key;
 entry.methods = ['GET', 'POST'];
 }

 for (const key of Object.keys(serverModules)) {
 const path = normalizeRouteKey(key);
 const entry = ensure(path);
 entry.files.server = key;
 entry.methods = ['GET', 'POST', 'PUT', 'DELETE'];
 entry.tags = Array.from(new Set([...entry.tags, 'api']));
 }

 for (const key of Object.keys(layoutModules)) {
 const path = normalizeRouteKey(key);
 ensure(path).files.layout = key;
 }

 for (const key of Object.keys(layoutServerModules)) {
 const path = normalizeRouteKey(key);
 ensure(path).files.layout_server = key;
 }

 // Update kind based on files
 for (const entry of map.values()) {
 entry.kind = inferKind(entry.files);
 }

 return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
}


