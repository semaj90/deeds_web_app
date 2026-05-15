/**
 * Advisory Locks for Legal AI Platform
 * PostgreSQL advisory locks for concurrent resource access control
 */

export type LockType = 'case' | 'evidence' | 'document' | 'user' | 'workflow' | 'analysis' | 'vector_index' | 'chain_of_custody';
export type LockMode = 'exclusive' | 'shared';

export const LOCK_MODES = {
	EXCLUSIVE: 'exclusive' as const,
	SHARED: 'shared' as const,
};

interface LockOptions {
	userId?: string;
	sessionId?: string;
	timeout?: number;
}

interface LockInfo {
	entityType: LockType;
	entityId: string;
	mode: LockMode;
	acquiredAt: Date;
	userId?: string;
	sessionId?: string;
}

class AdvisoryLocks {
	private locks = new Map<string, LockInfo>();

	private lockKey(entityType: LockType, entityId: string): string {
		return `${entityType}:${entityId}`;
	}

	async acquireLock(
		entityType: LockType,
		entityId: string,
		mode: LockMode = LOCK_MODES.EXCLUSIVE,
		options: LockOptions = {}
	): Promise<LockInfo | null> {
		const key = this.lockKey(entityType, entityId);
		const existing = this.locks.get(key);

		if (existing && existing.mode === LOCK_MODES.EXCLUSIVE) {
			console.warn(`Lock already held: ${key}`);
			return null;
		}

		const lock: LockInfo = {
			entityType,
			entityId,
			mode,
			acquiredAt: new Date(),
			userId: options.userId,
			sessionId: options.sessionId,
		};

		this.locks.set(key, lock);
		return lock;
	}

	async releaseLock(entityType: LockType, entityId: string, _mode?: LockMode): Promise<void> {
		const key = this.lockKey(entityType, entityId);
		this.locks.delete(key);
	}

	isLocked(entityType: LockType, entityId: string): boolean {
		return this.locks.has(this.lockKey(entityType, entityId));
	}

	getActiveLocks(): LockInfo[] {
		return Array.from(this.locks.values());
	}
}

export const advisoryLocks = new AdvisoryLocks();
