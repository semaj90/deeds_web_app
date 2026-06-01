/**
 * Batched API Audit Buffer
 *
 * Collects API request audit entries and flushes them in batches
 * to the api_audit_log table. Best-effort: silently drops on DB failure.
 *
 * Usage in hooks.server.ts:
 *   import { auditBuffer } from '$lib/server/audit/api-audit-buffer';
 *   auditBuffer.push({ method, path, statusCode, durationMs, userId, ... });
 */

import { pool } from '$lib/server/db/client';

export interface AuditEntry {
	requestId?: string;
	method: string;
	path: string;
	statusCode: number;
	durationMs?: number;
	userId?: string;
	ipAddress?: string;
	userAgent?: string;
	requestBodySize?: number;
	errorMessage?: string;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 100;

/** Paths excluded from audit logging (high-frequency health/monitoring) */
const EXCLUDED_PREFIXES = ['/api/health', '/api/ping', '/api/metrics', '/api/sse/'];

class ApiAuditBuffer {
	private buffer: AuditEntry[] = [];
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private flushing = false;

	start(): void {
		if (this.flushTimer) return;
		this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
	}

	push(entry: AuditEntry): void {
		// Skip excluded paths
		if (EXCLUDED_PREFIXES.some(prefix => entry.path.startsWith(prefix))) return;

		this.buffer.push(entry);

		// Flush immediately if buffer is full
		if (this.buffer.length >= MAX_BUFFER_SIZE) {
			this.flush();
		}
	}

	async flush(): Promise<void> {
		if (this.flushing || this.buffer.length === 0) return;
		this.flushing = true;

		// Swap buffer atomically
		const batch = this.buffer;
		this.buffer = [];

		try {
			// Build parameterized batch INSERT
			// Note: Table schema has: id, user_id, endpoint, method, status_code, request_body, response_body, ip_address, user_agent, duration_ms, created_at, metadata
			const values: unknown[] = [];
			const placeholders: string[] = [];

			for (let i = 0; i < batch.length; i++) {
				const offset = i * 6; // Changed from 10 to 6 params
				const entry = batch[i];
				placeholders.push(
					`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
				);
				values.push(
					entry.userId ?? null,
					entry.path, // Maps to 'endpoint' column
					entry.method,
					entry.statusCode,
					entry.ipAddress ?? null,
					entry.durationMs ?? null
				);
			}

			const sql = `
				INSERT INTO api_audit_log
					(user_id, endpoint, method, status_code, ip_address, duration_ms)
				VALUES ${placeholders.join(', ')}
			`;

			await pool.query(sql, values);
		} catch {
			// Best-effort: silently drop on DB failure — never block requests
		} finally {
			this.flushing = false;
		}
	}

	async shutdown(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		await this.flush();
	}
}

export const auditBuffer = new ApiAuditBuffer();
