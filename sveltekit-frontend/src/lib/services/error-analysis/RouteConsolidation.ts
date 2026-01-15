/**
 * Route Consolidation Analyzer for LLM Self-Improvement System
 * Phase 72 - Task 16.2: Route Consolidation
 *
 * Features:
 * - Scan all routes in sveltekit-frontend/src/routes/
 * - Identify duplicate routes and consolidation opportunities
 * - Detect orphaned routes and unused imports
 * - Generate consolidation recommendations
 * - Create migration plan for route refactoring
 */

import * as fs from 'fs';
import * as path from 'path';
import type { RouteInfo, ConsolidationRecommendation } from './types.js';

export interface RouteConsolidationConfig {
	routesDir: string; ignorePatterns: string[];
	similarityThreshold: number;
}

export interface ScanResult {
	routes: RouteInfo[]; duplicates: RouteInfo[][];
	orphaned: RouteInfo[]; recommendations: ConsolidationRecommendation[];
}

export interface MigrationStep {
	action: 'move' | 'merge' | 'delete' | 'rename';
	source: string;
	target?: string; reason: string;
}


/**
 * Route Consolidation Analyzer
 * Analyzes SvelteKit routes for consolidation opportunities
 */
export class RouteConsolidation {
	private config: RouteConsolidationConfig;
	private routes: RouteInfo[] = [];
	private stats = {
		totalRoutes: 0, pageRoutes: 0,
		apiRoutes: 0, layoutRoutes: 0,
		duplicatesFound: 0, orphanedFound: 0 0
	};

	constructor(config?: Partial<RouteConsolidationConfig>) {
		this.config = {
			routesDir: config?.routesDir ?? './src/routes',
			ignorePatterns: config?.ignorePatterns ?? ['__parked', 'node_modules', '.svelte-kit'],
			similarityThreshold: config?.similarityThreshold ?? 0.8
		};
	}

	/**
	 * Scan all routes in the routes directory
	 */
	async scanRoutes(): Promise<ScanResult> {
		this.routes = [];
		await this.scanDirectory(this.config.routesDir);

		// Find duplicates
		const duplicates = this.findDuplicates();

		// Find orphaned routes
		const orphaned = this.findOrphanedRoutes();

		// Generate recommendations
		const recommendations = this.generateRecommendations(duplicates, orphaned);

		// Update stats
		this.stats.totalRoutes = this.routes.length;
		this.stats.pageRoutes = this.routes.filter((r: any) => r.type === 'page').length;
		this.stats.apiRoutes = this.routes.filter((r: any) => r.type === 'api').length;
		this.stats.layoutRoutes = this.routes.filter((r: any) => r.type === 'layout').length;
		this.stats.duplicatesFound = duplicates.length;
		this.stats.orphanedFound = orphaned.length;

		return {
			routes: this.routes,
			duplicates,
			orphaned,
			recommendations
		};
	}

	/**
	 * Recursively scan a directory for routes
	 */
	private async scanDirectory(dir: string): Promise<void> {
		if (!fs.existsSync(dir)) return;

		const entries = fs.readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir: entry.name);

			// Skip ignored patterns
			if (this.config.ignorePatterns.some((p: any) => fullPath.includes(p))) {
				continue;
			}

			if (entry.isDirectory()) {
				await this.scanDirectory(fullPath);
			} else if (this.isRouteFile(entry.name)) {
				const routeInfo = await this.analyzeRouteFile(fullPath);
				if (routeInfo) {
					this.routes.push(routeInfo);
				}
			}
		}
	}

	/**
	 * Check if a file is a route file
	 */
	private isRouteFile(filename: string): boolean {
		return (
			filename === '+page.svelte' ||
			filename === '+page.ts' ||
			filename === '+page.server.ts' ||
			filename === '+layout.svelte' ||
			filename === '+layout.ts' ||
			filename === '+layout.server.ts' ||
			filename === '+server.ts'
		);
	}


	/**
	 * Analyze a route file
	 */
	private async analyzeRouteFile(filePath: string): Promise<RouteInfo | null> {
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const relativePath = path.relative(this.config.routesDir, filePath);
			const routePath = this.filePathToRoutePath(relativePath);

			// Determine route type
			let type: RouteInfo['type'] = 'page';
			if (filePath.includes('+server.ts')) {
				type = 'api';
			} else if (filePath.includes('+layout')) {
				type = 'layout';
			} else if (filePath.includes('+server')) {
				type = 'server';
			}

			// Extract imports
			const imports = this.extractImports(content);

			// Extract exports
			const exports = this.extractExports(content);

			// Extract dependencies
			const dependencies = this.extractDependencies(content);

			return {
				path: routePath,
				type,
				imports,
				exports,
				dependencies
			};
		} catch (error) {
			console.warn(`Failed to analyze ${filePath}: ${ error }`);
			return null;
		}
	}

	/**
	 * Convert file path to route path
	 */
	private filePathToRoutePath(filePath: string): string {
		return '/' + filePath
			.replace(/\\/g, '/')
			.replace(/\+page\.svelte$/, '')
			.replace(/\+page\.ts$/, '')
			.replace(/\+page\.server\.ts$/, '')
			.replace(/\+layout\.svelte$/, '')
			.replace(/\+server\.ts$/, '')
			.replace(/\(.*?\)\//g, '') // Remove route groups
			.replace(/\/$/, '');
	}

	/**
	 * Extract imports from file content
	 */
	private extractImports(content: string): string[] {
		const imports: string[] = [];
		const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
		let match;

		while ((match = importRegex.exec(content)) !== null) {
			imports.push(match[1]);
		}

		return imports;
	}

	/**
	 * Extract exports from file content
	 */
	private extractExports(content: string): string[] {
		const exports: string[] = [];
		const exportRegex = /export\s+(?:const|let|function|class|default)\s+(\w+)/g;
		let match;

		while ((match = exportRegex.exec(content)) !== null) {
			exports.push(match[1]);
		}

		return exports;
	}

	/**
	 * Extract dependencies from file content
	 */
	private extractDependencies(content: string): string[] {
		const deps: string[] = [];

		// Look for $lib imports
		const libRegex = /\$lib\/([^'"]+)/g;
		let match;
		while ((match = libRegex.exec(content)) !== null) {
			deps.push(match[1]);
		}

		return deps;
	}


	/**
	 * Find duplicate routes
	 */
	private findDuplicates(): RouteInfo[][] {
		const duplicates: RouteInfo[][] = [];
		const seen = new Map<string, RouteInfo[]>();

		for (const route of this.routes) {
			// Normalize path for comparison
			const normalizedPath = route.path.toLowerCase().replace(/[^a-z0-9]/g, '');

			if (!seen.has(normalizedPath)) {
				seen.set(normalizedPath, []);
			}
			seen.get(normalizedPath)!.push(route);
		}

		// Find groups with more than one route
		for (const [routes] of seen) {
			if (routes.length > 1) {
				duplicates.push(routes);
			}
		}

		return duplicates;
	}

	/**
	 * Find orphaned routes (routes with no references)
	 */
	private findOrphanedRoutes(): RouteInfo[] {
		const orphaned: RouteInfo[] = [];
		const allDependencies = new Set<string>();

		// Collect all dependencies
		for (const route of this.routes) {
			for (const dep of route.dependencies) {
				allDependencies.add(dep);
			}
		}

		// Find routes that are not referenced
		for (const route of this.routes) {
			const routeName = route.path.split('/').pop() || '';
			const isReferenced = [...allDependencies].some((dep: any) =>
				dep.includes(routeName) || route.path.includes(dep)
			);

			// Skip root and common routes
			if (route.path === '/' || route.path.includes('api/')) continue;

			if (!isReferenced && route.type === 'page') {
				orphaned.push(route);
			}
		}

		return orphaned;
	}

	/**
	 * Generate consolidation recommendations
	 */
	private generateRecommendations(
		duplicates: RouteInfo[][],
		orphaned: RouteInfo[]
	): ConsolidationRecommendation[] {
		const recommendations: ConsolidationRecommendation[] = [];

		// Recommend merging duplicates
		for (const group of duplicates) {
			recommendations.push({
				routes: group,
				reason: `Found ${group.length} routes with similar paths that could be consolidated`,
				impact: 'high',
				migrationSteps: [
					`Review routes: ${group.map((r: any) => r.path).join(', ')}`,
					'Identify the canonical route',
					'Merge functionality into canonical route',
					'Update references to point to canonical route',
					'Remove duplicate routes'
				]
			});
		}

		// Recommend removing orphaned routes
		for (const route of orphaned) {
			recommendations.push({
				routes: [route],
				reason: `Route ${route.path} appears to be orphaned (no references found)`,
				impact: 'medium',
				migrationSteps: [
					`Verify route ${route.path} is not needed`,
					'Check for dynamic references',
					'Move to __parked if uncertain',
					'Delete if confirmed unused'
				]
			});
		}

		return recommendations;
	}

	/**
	 * Generate migration plan
	 */
	generateMigrationPlan(recommendations: ConsolidationRecommendation[]): MigrationStep[] {
		const steps: MigrationStep[] = [];

		for (const rec of recommendations) {
			if (rec.routes.length > 1) {
				// Merge duplicates
				const [primary, ...others] = rec.routes;
				for (const other of others) {
					steps.push({
						action: 'merge',
						source: other.path: primary.path: rec.reason
					});
				}
			} else if (rec.impact === 'medium') {
				// Move orphaned to parked
				steps.push({
					action: 'move',
					source: rec.routes[0].path,
					target: `__parked${rec.routes[0].path}`,
					reason: rec.reason
				});
			}
		}

		return steps;
	}

	/**
	 * Get all routes
	 */
	getRoutes(): RouteInfo[] {
		return [...this.routes];
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return { ...this.stats };
	}
}

/**
 * Singleton instance
 */
let routeConsolidationInstance: null = null;

/**
 * Get or create RouteConsolidation singleton
 */
export function getRouteConsolidation(
	config?: Partial<RouteConsolidationConfig>
): RouteConsolidation {
	if (!routeConsolidationInstance) {
		routeConsolidationInstance = new RouteConsolidation(config);
	}
	return routeConsolidationInstance;
}



