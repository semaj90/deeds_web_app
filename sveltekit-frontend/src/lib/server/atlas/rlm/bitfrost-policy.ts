import { bifrostEligibilityKey } from '$lib/server/ace/cache-keys.js';

export interface BitfrostCacheClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
}

export interface BitfrostEnvelope<T> {
	workspaceRevision: string;
	policyRevision: string;
	value: T;
	negative?: boolean;
	createdAt: string;
}

export interface TrackingClient {
	call(...args: string[]): Promise<unknown>;
}

export async function readRevisionedBitfrost<T>(
	cache: BitfrostCacheClient,
	key: string,
	workspaceRevision: string,
	policyRevision: string,
): Promise<BitfrostEnvelope<T> | null> {
	try {
		const raw = await cache.get(key);
		if (!raw) return null;
		const envelope = JSON.parse(raw) as BitfrostEnvelope<T>;
		if (envelope.workspaceRevision !== workspaceRevision || envelope.policyRevision !== policyRevision) return null;
		return envelope;
	} catch {
		return null;
	}
}

export async function writeRevisionedBitfrost<T>(
	cache: BitfrostCacheClient,
	key: string,
	value: T,
	workspaceRevision: string,
	policyRevision: string,
	ttlSeconds: number,
	negative = false,
): Promise<boolean> {
	try {
		const envelope: BitfrostEnvelope<T> = { workspaceRevision, policyRevision, value, negative, createdAt: new Date().toISOString() };
		await cache.set(key, JSON.stringify(envelope), 'EX', ttlSeconds);
		return true;
	} catch {
		return false;
	}
}

export function negativeEligibilityKey(workspaceRevision: string, policyRevision: string, eligibilityHash: string): string {
	return bifrostEligibilityKey(workspaceRevision, policyRevision, eligibilityHash);
}

/** Opt-in only: callers must provide a dedicated RESP3-capable connection. */
export async function enableBitfrostTracking(client: TrackingClient, prefixes: string[]): Promise<boolean> {
	try {
		await client.call('CLIENT', 'TRACKING', 'ON', 'BCAST', ...prefixes.flatMap((prefix) => ['PREFIX', prefix]));
		return true;
	} catch {
		return false;
	}
}
