import type { User } from '$lib/types';
import { sql } from '$lib/database/connection';
import { randomUUID } from 'crypto';

/**
 * PostgreSQL Advisory Locks for Legal AI Platform
 * Prevents concurrent modifications of critical legal data
 */

// Lock types for legal AI operations
export const LOCK_TYPES = {
	CASE: 'case',
	EVIDENCE: 'evidence',
	DOCUMENT: 'document',
	USER: 'user',
	WORKFLOW: 'workflow',
	ANALYSIS: 'analysis',
	VECTOR_INDEX: 'vector_index',
	CHAIN_OF_CUSTODY: 'chain_of_custody'
} as const;

export type LockType = typeof LOCK_TYPES[keyof typeof LOCK_TYPES];

// Lock modes
export const LOCK_MODES = {
	EXCLUSIVE: 'exclusive', // Full exclusive access
	SHARED: 'shared', // Multiple readers, no writers
	UPDATE: 'update' // Single writer, multiple readers
} as const;

export type LockMode = typeof LOCK_MODES[keyof typeof LOCK_MODES];

export interface LockOptions {
	timeout?: number; // Lock timeout in milliseconds
	userId?: string; // User requesting the lock
	sessionId?: string; // Session identifier
	metadata?: Record<string, any>;
}

export interface LockInfo {
	lockId: string;, entityType: LockType;
	entityId: string;, mode: LockMode;
	userId?: string;
	sessionId?: string;
	expiresAt?: Date;
	metadata?: Record<string, any>;
}

export class AdvisoryLockService {
	private locks = new Map<string, LockInfo>();

	/**
	 * Generate a numeric lock ID from entity type and ID
	 * PostgreSQL advisory locks require numeric IDs
	 */
	private generateLockId(entityType: LockType, entityId: string): number {
		// Create a hash of the entity type and ID
		const str = `${entityType}:${entityId}`;
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash);
	}

	/**
	 * Acquire an exclusive advisory lock
	 * Blocks until lock is available or timeout
	 */
	async acquireLock(
		entityType: LockType,
		entityId: string,
		mode: LockMode = LOCK_MODES.EXCLUSIVE,
		options: LockOptions = {}
	): Promise<LockInfo | null> {
		const lockKey = `${entityType}:${entityId}:${mode}`;
		const numericLockId = this.generateLockId(entityType, entityId);
		const lockId = randomUUID();
		const { timeout = 30000, userId, sessionId, metadata } = options;

		try {
			console.log(`🔒 Acquiring ${mode} lock for ${entityType} ${entityId} (${numericLockId})`);
			let lockAcquired = false;
			const startTime = Date.now();

			// Try to acquire the lock with timeout
			while (!lockAcquired && (Date.now() - startTime) < timeout) {
				if (mode === LOCK_MODES.EXCLUSIVE) {
					// Exclusive lock - blocks all other access
					const [result] = await sql`SELECT pg_try_advisory_lock(${numericLockId}) as acquired`;
					lockAcquired = !!(result as any).acquired;
				} else if (mode === LOCK_MODES.SHARED) {
					// Shared lock - allows multiple readers
					const [result] = await sql`SELECT pg_try_advisory_lock_shared(${numericLockId}) as acquired`;
					lockAcquired = !!(result as any).acquired;
				} else {
					// Update lock (custom implementation using exclusive lock on adjacent ID)
					const [result] = await sql`SELECT pg_try_advisory_lock(${numericLockId + 1}) as acquired`;
					lockAcquired = !!(result as any).acquired;
				}

				if (!lockAcquired) {
					// Wait a bit before retrying
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}

			if (!lockAcquired) {
				console.warn(`⚠️ Failed to acquire ${mode} lock for ${entityType} ${entityId} after ${timeout}ms`);
				return null;
			}

			// Create lock info
			const lockInfo: LockInfo = {
				lockId,
				entityType,
				entityId,
				mode,
				userId,
				sessionId,
				expiresAt: timeout ? new Date(Date.now() + timeout) : undefined,
				metadata
			};

			// Store lock info for tracking
			this.locks.set(lockKey, lockInfo);
			console.log(`✅ Acquired ${mode} lock for ${entityType} ${entityId}`);
			return lockInfo;

		} catch (error) {
			console.error(`❌ Error acquiring lock for ${entityType} ${entityId}:`, error);
			return null;
		}
	}

	/**
	 * Release an advisory lock
	 */
	async releaseLock(
		entityType: LockType,
		entityId: string,
		mode: LockMode = LOCK_MODES.EXCLUSIVE
	): Promise<boolean> {
		const lockKey = `${entityType}:${entityId}:${mode}`;
		const numericLockId = this.generateLockId(entityType, entityId);

		try {
			console.log(`🔓 Releasing ${mode} lock for ${entityType} ${entityId}`);
			let released = false;

			if (mode === LOCK_MODES.EXCLUSIVE) {
				const [result] = await sql`SELECT pg_advisory_unlock(${numericLockId}) as released`;
				released = !!(result as any).released;
			} else if (mode === LOCK_MODES.SHARED) {
				const [result] = await sql`SELECT pg_advisory_unlock_shared(${numericLockId}) as released`;
				released = !!(result as any).released;
			} else {
				// Update lock
				const [result] = await sql`SELECT pg_advisory_unlock(${numericLockId + 1}) as released`;
				released = !!(result as any).released;
			}

			if (released) {
				this.locks.delete(lockKey);
				console.log(`✅ Released ${mode} lock for ${entityType} ${entityId}`);
			} else {
				console.warn(`⚠️ Failed to release ${mode} lock for ${entityType} ${entityId}`);
			}

			return released;

		} catch (error) {
			console.error(`❌ Error releasing lock for ${entityType} ${entityId}:`, error);
			return false;
		}
	}

	/**
	 * Execute a function with an exclusive lock
	 */
	async withLock<T>(
		entityType: LockType,
		entityId: string,
		fn: () => Promise<T>,
		mode: LockMode = LOCK_MODES.EXCLUSIVE,
		options: LockOptions = {}
	): Promise<T> {
		const lock = await this.acquireLock(entityType, entityId, mode, options);
		if (!lock) {
			throw new Error(`Failed to acquire ${mode} lock for ${entityType} ${entityId}`);
		}

		try {
			return await fn();
		} finally {
			await this.releaseLock(entityType, entityId, mode);
		}
	}

	/**
	 * Check if an entity is currently locked
	 */
	async isLocked(
		entityType: LockType,
		entityId: string,
		mode?: LockMode
	): Promise<boolean> {
		const numericLockId = this.generateLockId(entityType, entityId);

		try {
			if (mode === LOCK_MODES.SHARED || !mode) {
				// Check for any lock
				const [result] = await sql`
					SELECT count(*) > 0 as locked
					FROM pg_locks
					WHERE locktype = 'advisory' AND objid = ${numericLockId}
				`;
				return !!(result as any).locked;
			} else {
				// Check for specific lock type
				const lockIdToCheck = mode === LOCK_MODES.UPDATE ? numericLockId + 1 : numericLockId;
				const [result] = await sql`
					SELECT count(*) > 0 as locked
					FROM pg_locks
					WHERE locktype = 'advisory' AND objid = ${lockIdToCheck}
				`;
				return !!(result as any).locked;
			}
		} catch (error) {
			console.error(`Error checking lock status for ${entityType} ${entityId}:`, error);
			return false;
		}
	}

	/**
	 * Get information about current locks
	 */
	async getLockInfo(entityType?: LockType, entityId?: string): Promise<LockInfo[]> {
		if (entityType && entityId) {
			const lockKey = `${entityType}:${entityId}`;
			const matches = Array.from(this.locks.entries())
				.filter(([key]) => key.startsWith(lockKey))
				.map(([_, info]) => info);
			return matches;
		}
		return Array.from(this.locks.values());
	}

	/**
	 * Release all locks held by a session
	 */
	async releaseSessionLocks(sessionId: string): Promise<number> {
		let releasedCount = 0;
		for (const [key, lockInfo] of this.locks.entries()) {
			if (lockInfo.sessionId === sessionId) {
				const [entityType, entityId, mode] = key.split(':');
				const released = await this.releaseLock(
					entityType as LockType,
					entityId,
					mode as LockMode
				);
				if (released) {
					releasedCount++;
				}
			}
		}
		console.log(`🧹 Released ${releasedCount} locks for session ${sessionId}`);
		return releasedCount;
	}

	/**
	 * Health check - clean up expired locks
	 */
	async healthCheck(): Promise<any> {
		const now = new Date();
		let active = 0;
		let expired = 0;
		let cleaned = 0;

		for (const [key, lockInfo] of this.locks.entries()) {
			if (lockInfo.expiresAt && lockInfo.expiresAt < now) {
				expired++;
				// Try to release expired lock
				const [entityType, entityId, mode] = key.split(':');
				const released = await this.releaseLock(
					entityType as LockType,
					entityId,
					mode as LockMode
				);
				if (released) {
					cleaned++;
				}
			} else {
				active++;
			}
		}

		if (cleaned > 0) {
			console.log(`🧹 Cleaned up ${cleaned} expired locks`);
		}

		return { active, expired, cleaned };
	}
}

// Export singleton instance
export const advisoryLocks = new AdvisoryLockService();
export default advisoryLocks;

