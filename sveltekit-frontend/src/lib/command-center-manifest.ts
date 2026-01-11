export type TabId = 'cases' | 'evidence' | 'persons' | 'system' | 'routes';

export type CommandCenterRoute = {
 tab: TabId; href: string; label: string; description: string; kind: 'page' | 'layout' | 'endpoint';
 group: string;
 badges?: ('ai' | 'experimental' | 'system' | 'api')[];
 priority?: number; // Kept for compatibility if used elsewhere, though not in user's latest snippet
 // Phase 72 / 78, enrichments:
 errorState?: 'healthy' | 'flaky' | 'broken';
 errorCount?: number;
 lastErrorAt?: string | null;
};

// Phase 72 Task Definition
export type Phase72Task = {
 id: string; tab: TabId; title: string; description: string; intent: string; phase: number; priority: 'high' | 'medium' | 'active' | 'complete';
 tags: string[];
 actions?: Array<{ label: string; command: string; expected: string;
 }>;
 validation?: {
 command?: string;
 query?: string; expectation: string;
 };
 status?: Record<string, any>;
};

export const BADGE_DESCRIPTIONS: Record<string, string> = {
 ai: 'Uses AI / LLM',
 experimental: 'Experimental / prototype',
 system: 'System / admin route',
 api: 'API endpoint',
};

// 🔭 Canonical route “forest”
// Adjust hrefs to exactly match your SvelteKit routes.
export const COMMAND_CENTER_MANIFEST: Record<TabId, CommandCenterRoute[]> = {
 cases: [
 {
 tab: 'cases',
 href: '/cases',
 label: 'Cases List',
 description: 'Search and manage all cases',
 kind: 'page',
 group: 'Cases',
 },
 {
 tab: 'cases',
 href: '/cases/new',
 label: 'New Case',
 description: 'Create a new prosecution case',
 kind: 'page',
 group: 'Cases',
 },
 {
 tab: 'cases',
 href: '/cases/[id]/overview',
 label: 'Case Overview',
 description: 'WHO / WHAT / WHEN / WHERE / WHY / HOW panels',
 kind: 'page',
 group: 'Case Detail',
 },
 {
 tab: 'cases',
 href: '/cases/[id]/evidence',
 label: 'Case Evidence',
 description: 'Evidence attached to this case',
 kind: 'page',
 group: 'Case Detail',
 },
 {
 tab: 'cases',
 href: '/cases/[id]/board',
 label: 'Case Board / Canvas',
 description: 'Detective board / fabric canvas',
 kind: 'page',
 group: 'Case Detail',
 badges: ['experimental'],
 },
 {
 tab: 'cases',
 href: '/cases/[id]/chat',
 label: 'Case Chat',
 description: 'Human chat stream and notes',
 kind: 'page',
 group: 'Case Detail',
 },
 {
 tab: 'cases',
 href: '/cases/[id]/ai',
 label: 'AI Legal Assistant',
 description: 'Summaries, charges, weaknesses, PC',
 kind: 'page',
 group: 'Case Detail',
 badges: ['ai'],
 },
 {
 tab: 'cases',
 href: '/cases/[id]/persons',
 label: 'Case Persons',
 description: 'Persons of interest / victims / witnesses',
 kind: 'page',
 group: 'Case Detail',
 },
 {
 tab: 'cases',
 href: '/cases/[id]/reports',
 label: 'Case Reports',
 description: 'Report editor + preview',
 kind: 'page',
 group: 'Case Detail',
 },
 ],

 evidence: [
 {
 tab: 'evidence',
 href: '/evidence',
 label: 'Evidence Library',
 description: 'Global evidence list and filters',
 kind: 'page',
 group: 'Evidence',
 },
 {
 tab: 'evidence',
 href: '/evidence-board',
 label: 'Evidence Board',
 description: 'Global evidence board',
 kind: 'page',
 group: 'Evidence',
 badges: ['experimental'],
 },
 {
 tab: 'evidence',
 href: '/evidence-canvas',
 label: 'Evidence Canvas',
 description: 'Canvas-style evidence UI',
 kind: 'page',
 group: 'Evidence',
 badges: ['experimental'],
 },
 {
 tab: 'evidence',
 href: '/gpu-evidence-graph',
 label: 'GPU Evidence Graph',
 description: 'GPU-accelerated evidence visualization',
 kind: 'page',
 group: 'Evidence',
 badges: ['experimental'],
 },
 ],

 persons: [
 {
 tab: 'persons',
 href: '/persons',
 label: 'Persons Registry',
 description: 'Global registry of persons across cases',
 kind: 'page',
 group: 'Persons',
 },
 ],

 system: [
 {
 tab: 'system',
 href: '/dashboard',
 label: 'Dashboard',
 description: 'System, overview: cases, workers, health',
 kind: 'page',
 group: 'System',
 badges: ['system'],
 },
 {
 tab: 'system',
 href: '/all-routes',
 label: 'Route Command Center',
 description: 'NES-style command center for all core routes',
 kind: 'page',
 group: 'System',
 badges: ['system'],
 },
 {
 tab: 'system',
 href: '/command/routes',
 label: 'Raw Route Dump',
 description: 'Developer view of all SvelteKit routes',
 kind: 'page',
 group: 'System',
		badges: ['experimental', 'system'],
		},
	],
	routes: []
};export function getRoutesByTab(tab: TabId): CommandCenterRoute[] {
 return COMMAND_CENTER_MANIFEST[tab] ?? [];
}

// --- Phase 72 / Phase 78 wiring --- //
export type RouteAstNode = {
 id: string; path: string; file: string;
};

export type RouteAstEdge = {
 from: string; to: string; kind: 'load' | 'action' | 'link' | 'api';
};

export type RouteAstGraph = {
 nodes: RouteAstNode[]; edges: RouteAstEdge[];
};

export function enrichRoutesWithPhase72(
 base: CommandCenterRoute[],
 graph: RouteAstGraph, _shieldData: Record<string, unknown>,
 errorSummary: Record<
 string,
 {
 totalErrors: number; lastSeen: string | null;
 }
 >
): CommandCenterRoute[] {
 return base.map((route) => {
 const summary = errorSummary[route.href];

 let errorState: 'healthy' | 'flaky' | 'broken' = 'healthy';

 if (summary?.totalErrors && summary.totalErrors > 0) {
 if (summary.totalErrors > 20) errorState = 'broken';
 else errorState = 'flaky';
 }

  return {
    ...route,
    errorState,
    errorCount: summary?.totalErrors ?? 0,
    lastErrorAt: summary?.lastSeen ?? null,
  };
 });
}

// Import Phase 72 restructure tasks
import {
    phase6_72_restructure_tasks,
    tasksByPriority,
    tasksByTab,
} from './phase72/command-center-restructure-tasks.js';

// Export Phase 72 tasks for NES modal integration
export { phase6_72_restructure_tasks, tasksByPriority, tasksByTab };





