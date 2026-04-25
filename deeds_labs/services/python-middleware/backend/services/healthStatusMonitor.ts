/**
 * Phase 10.5: Health Status Change Detection
 * Location: backend/services/healthStatusMonitor.ts
 *
 * Purpose: Monitor route health status changes and broadcast to WebSocket clients
 *
 * Features:
 * - Listen for health status changes
 * - Detect when status changes (healthy → flaky → broken)
 * - Broadcast changes to WebSocket clients
 * - Log status changes
 */

import type { HealthUpdateMessage } from '../../sveltekit-frontend/src/lib/services/healthUpdates';

// In-memory store of current route health statuses
const routeHealthStatus = new Map<string, 'healthy' | 'flaky' | 'broken'>();

// Callback function for broadcasting updates
let broadcastCallback: ((message: HealthUpdateMessage) => void) | null = null;

/**
 * Register a broadcast callback function
 * This is called by the WebSocket/SSE server to broadcast updates
 */
export function registerBroadcastCallback(
	callback: (message: HealthUpdateMessage) => void
): void {
	broadcastCallback = callback;
	console.log('[Phase 10.5] Broadcast callback registered');
}

/**
 * Update route health status and broadcast if changed
 */
export function updateRouteHealthStatus(
	routePath: string,
	newStatus: 'healthy' | 'flaky' | 'broken',
	errorCount: number = 0,
	warningCount: number = 0,
	lastErrorMessage?: string
): void {
	const oldStatus = routeHealthStatus.get(routePath) || 'healthy';

	// Check if status changed
	if (oldStatus !== newStatus) {
		console.log(
			`[Phase 10.5] Route health status changed: ${routePath} ${oldStatus} → ${newStatus}`
		);

		// Update in-memory store
		routeHealthStatus.set(routePath, newStatus);

		// Broadcast to all connected clients
		if (broadcastCallback) {
			const message: HealthUpdateMessage = {
				type: 'health_update',
				route_path: routePath,
				old_status: oldStatus,
				new_status: newStatus,
				error_count: errorCount,
				warning_count: warningCount,
				timestamp: new Date().toISOString(),
				last_error_message: lastErrorMessage
			};

			broadcastCallback(message);
			console.log(`[Phase 10.5] Broadcasted health update for ${routePath}`);
		} else {
			console.warn('[Phase 10.5] No broadcast callback registered');
		}
	}
}

/**
 * Get current health status for a route
 */
export function getRouteHealthStatus(routePath: string): 'healthy' | 'flaky' | 'broken' {
	return routeHealthStatus.get(routePath) || 'healthy';
}

/**
 * Get all route health statuses
 */
export function getAllRouteHealthStatuses(): Map<string, 'healthy' | 'flaky' | 'broken'> {
	return new Map(routeHealthStatus);
}

/**
 * Clear all route health statuses (for testing)
 */
export function clearAllHealthStatuses(): void {
	routeHealthStatus.clear();
	console.log('[Phase 10.5] Cleared all route health statuses');
}

/**
 * Detect status transition based on error count
 *
 * Rules:
 * - 0 errors → healthy
 * - 1-3 errors → flaky
 * - 4+ errors → broken
 */
export function detectStatusTransition(errorCount: number): 'healthy' | 'flaky' | 'broken' {
	if (errorCount === 0) {
		return 'healthy';
	} else if (errorCount <= 3) {
		return 'flaky';
	} else {
		return 'broken';
	}
}

/**
 * Process health event and update status
 * Called when a new health event is created
 */
export function processHealthEvent(
	routePath: string,
	errorCount: number,
	warningCount: number,
	lastErrorMessage?: string
): void {
	const newStatus = detectStatusTransition(errorCount);
	updateRouteHealthStatus(routePath, newStatus, errorCount, warningCount, lastErrorMessage);
}

/**
 * Initialize health status monitor
 * Called on application startup
 */
export function initializeHealthStatusMonitor(): void {
	console.log('[Phase 10.5] Health status monitor initialized');
	routeHealthStatus.clear();
}

/**
 * Shutdown health status monitor
 * Called on application shutdown
 */
export function shutdownHealthStatusMonitor(): void {
	console.log('[Phase 10.5] Health status monitor shutdown');
	routeHealthStatus.clear();
	broadcastCallback = null;
}
