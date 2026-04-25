import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	registerBroadcastCallback,
	updateRouteHealthStatus,
	getRouteHealthStatus,
	getAllRouteHealthStatuses,
	clearAllHealthStatuses,
	detectStatusTransition,
	processHealthEvent,
	initializeHealthStatusMonitor,
	shutdownHealthStatusMonitor
} from './healthStatusMonitor';
import type { HealthUpdateMessage } from '../../sveltekit-frontend/src/lib/services/healthUpdates';

/**
 * Phase 10.5: Health Status Change Detection - Tests
 *
 * Test Scenarios:
 * - Monitor route health status changes
 * - Detect when status changes (healthy → flaky → broken)
 * - Broadcast changes to WebSocket clients
 * - Log status changes
 */

describe('Phase 10.5: Health Status Monitor', () => {
	let broadcastMessages: HealthUpdateMessage[] = [];
	let broadcastCallback: ((message: HealthUpdateMessage) => void) | null = null;

	beforeEach(() => {
		broadcastMessages = [];
		broadcastCallback = (message: HealthUpdateMessage) => {
			broadcastMessages.push(message);
		};
		initializeHealthStatusMonitor();
		registerBroadcastCallback(broadcastCallback);
	});

	afterEach(() => {
		shutdownHealthStatusMonitor();
		broadcastMessages = [];
	});

	describe('Status Detection', () => {
		it('should detect healthy status with 0 errors', () => {
			const status = detectStatusTransition(0);
			expect(status).toBe('healthy');
		});

		it('should detect flaky status with 1-3 errors', () => {
			expect(detectStatusTransition(1)).toBe('flaky');
			expect(detectStatusTransition(2)).toBe('flaky');
			expect(detectStatusTransition(3)).toBe('flaky');
		});

		it('should detect broken status with 4+ errors', () => {
			expect(detectStatusTransition(4)).toBe('broken');
			expect(detectStatusTransition(5)).toBe('broken');
			expect(detectStatusTransition(10)).toBe('broken');
		});
	});

	describe('Status Updates', () => {
		it('should update route health status', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5);
			const status = getRouteHealthStatus('/api/test');
			expect(status).toBe('broken');
		});

		it('should broadcast when status changes', () => {
			updateRouteHealthStatus('/api/test', 'healthy', 0);
			expect(broadcastMessages.length).toBe(0); // No change from default

			updateRouteHealthStatus('/api/test', 'broken', 5);
			expect(broadcastMessages.length).toBe(1);
			expect(broadcastMessages[0].type).toBe('health_update');
			expect(broadcastMessages[0].route_path).toBe('/api/test');
			expect(broadcastMessages[0].new_status).toBe('broken');
		});

		it('should not broadcast when status does not change', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5);
			broadcastMessages = [];

			updateRouteHealthStatus('/api/test', 'broken', 6);
			expect(broadcastMessages.length).toBe(0);
		});

		it('should include error count in broadcast', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5, 2, 'Test error');
			expect(broadcastMessages[0].error_count).toBe(5);
			expect(broadcastMessages[0].warning_count).toBe(2);
			expect(broadcastMessages[0].last_error_message).toBe('Test error');
		});

		it('should include timestamp in broadcast', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5);
			expect(broadcastMessages[0].timestamp).toBeDefined();
			expect(new Date(broadcastMessages[0].timestamp!).getTime()).toBeGreaterThan(0);
		});
	});

	describe('Status Retrieval', () => {
		it('should return healthy as default status', () => {
			const status = getRouteHealthStatus('/api/unknown');
			expect(status).toBe('healthy');
		});

		it('should return all route health statuses', () => {
			updateRouteHealthStatus('/api/test1', 'broken', 5);
			updateRouteHealthStatus('/api/test2', 'flaky', 2);

			const allStatuses = getAllRouteHealthStatuses();
			expect(allStatuses.get('/api/test1')).toBe('broken');
			expect(allStatuses.get('/api/test2')).toBe('flaky');
		});

		it('should clear all health statuses', () => {
			updateRouteHealthStatus('/api/test1', 'broken', 5);
			updateRouteHealthStatus('/api/test2', 'flaky', 2);

			clearAllHealthStatuses();

			expect(getRouteHealthStatus('/api/test1')).toBe('healthy');
			expect(getRouteHealthStatus('/api/test2')).toBe('healthy');
		});
	});

	describe('Health Event Processing', () => {
		it('should process health event and update status', () => {
			processHealthEvent('/api/test', 5, 2, 'Test error');
			expect(getRouteHealthStatus('/api/test')).toBe('broken');
		});

		it('should broadcast on health event', () => {
			processHealthEvent('/api/test', 5, 2, 'Test error');
			expect(broadcastMessages.length).toBe(1);
			expect(broadcastMessages[0].type).toBe('health_update');
		});

		it('should handle multiple health events', () => {
			processHealthEvent('/api/test', 0, 0);
			expect(getRouteHealthStatus('/api/test')).toBe('healthy');

			processHealthEvent('/api/test', 2, 0);
			expect(getRouteHealthStatus('/api/test')).toBe('flaky');

			processHealthEvent('/api/test', 5, 0);
			expect(getRouteHealthStatus('/api/test')).toBe('broken');

			expect(broadcastMessages.length).toBe(2); // Only 2 changes (healthy→flaky, flaky→broken)
		});
	});

	describe('Status Transitions', () => {
		it('should track healthy to flaky transition', () => {
			updateRouteHealthStatus('/api/test', 'healthy', 0);
			broadcastMessages = [];

			updateRouteHealthStatus('/api/test', 'flaky', 2);
			expect(broadcastMessages[0].old_status).toBe('healthy');
			expect(broadcastMessages[0].new_status).toBe('flaky');
		});

		it('should track flaky to broken transition', () => {
			updateRouteHealthStatus('/api/test', 'flaky', 2);
			broadcastMessages = [];

			updateRouteHealthStatus('/api/test', 'broken', 5);
			expect(broadcastMessages[0].old_status).toBe('flaky');
			expect(broadcastMessages[0].new_status).toBe('broken');
		});

		it('should track broken to healthy transition', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5);
			broadcastMessages = [];

			updateRouteHealthStatus('/api/test', 'healthy', 0);
			expect(broadcastMessages[0].old_status).toBe('broken');
			expect(broadcastMessages[0].new_status).toBe('healthy');
		});
	});

	describe('Multiple Routes', () => {
		it('should track multiple routes independently', () => {
			updateRouteHealthStatus('/api/test1', 'broken', 5);
			updateRouteHealthStatus('/api/test2', 'flaky', 2);
			updateRouteHealthStatus('/api/test3', 'healthy', 0);

			expect(getRouteHealthStatus('/api/test1')).toBe('broken');
			expect(getRouteHealthStatus('/api/test2')).toBe('flaky');
			expect(getRouteHealthStatus('/api/test3')).toBe('healthy');
		});

		it('should broadcast for each route change', () => {
			updateRouteHealthStatus('/api/test1', 'broken', 5);
			updateRouteHealthStatus('/api/test2', 'flaky', 2);

			expect(broadcastMessages.length).toBe(2);
			expect(broadcastMessages[0].route_path).toBe('/api/test1');
			expect(broadcastMessages[1].route_path).toBe('/api/test2');
		});
	});

	describe('Broadcast Callback', () => {
		it('should handle missing broadcast callback', () => {
			registerBroadcastCallback(null as any);
			expect(() => {
				updateRouteHealthStatus('/api/test', 'broken', 5);
			}).not.toThrow();
		});

		it('should call broadcast callback on status change', () => {
			const mockCallback = vi.fn();
			registerBroadcastCallback(mockCallback);

			updateRouteHealthStatus('/api/test', 'broken', 5);
			expect(mockCallback).toHaveBeenCalledOnce();
		});

		it('should pass correct message to callback', () => {
			const mockCallback = vi.fn();
			registerBroadcastCallback(mockCallback);

			updateRouteHealthStatus('/api/test', 'broken', 5, 2, 'Error message');
			const message = mockCallback.mock.calls[0][0];

			expect(message.type).toBe('health_update');
			expect(message.route_path).toBe('/api/test');
			expect(message.new_status).toBe('broken');
			expect(message.error_count).toBe(5);
			expect(message.warning_count).toBe(2);
			expect(message.last_error_message).toBe('Error message');
		});
	});

	describe('Initialization and Shutdown', () => {
		it('should initialize monitor', () => {
			initializeHealthStatusMonitor();
			expect(getAllRouteHealthStatuses().size).toBe(0);
		});

		it('should shutdown monitor', () => {
			updateRouteHealthStatus('/api/test', 'broken', 5);
			shutdownHealthStatusMonitor();
			expect(getAllRouteHealthStatuses().size).toBe(0);
		});

		it('should clear state on shutdown', () => {
			updateRouteHealthStatus('/api/test1', 'broken', 5);
			updateRouteHealthStatus('/api/test2', 'flaky', 2);

			shutdownHealthStatusMonitor();

			expect(getRouteHealthStatus('/api/test1')).toBe('healthy');
			expect(getRouteHealthStatus('/api/test2')).toBe('healthy');
		});
	});
});
