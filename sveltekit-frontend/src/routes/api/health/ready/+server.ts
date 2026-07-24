/**
 * GET /api/health/ready
 * Readiness probe for container orchestration (Docker healthcheck, K8s).
 * Returns 200 if core services (DB + Redis) are reachable, 503 otherwise.
 * Ollama is optional — degraded mode is acceptable.
 */
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import {
	getParentAtlasRuntimeProfileManifest,
	type RuntimeRequirementState,
} from '$lib/server/runtime-profile.js';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaFetch } from '$lib/server/ollama.js';

const PROBE_TIMEOUT = 3000;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PROBE_TIMEOUT)),
	]);
}

type ServiceState = {
	required: boolean;
	state: RuntimeRequirementState;
	ok: boolean;
	latencyMs: number;
	error?: string;
	rationale: string;
};

async function probeNeo4j(): Promise<boolean> {
	const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
	const driver = getNeo4jDriver();
	const session = driver.session();
	try {
		await session.run('RETURN 1 AS ok');
		return true;
	} catch {
		return false;
	} finally {
		try {
			await session.close();
		} catch {
			/* ignore close errors */
		}
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ ready: false, error: 'Unauthorized' }, { status: 401 });
	const redis: Redis = getRedis();
	const runtimeProfile = getParentAtlasRuntimeProfileManifest();
	const redisRequirement = runtimeProfile.services.redis.state;
	const qdrantRequirement = runtimeProfile.services.qdrant.state;
	const neo4jRequirement = runtimeProfile.services.neo4j.state;
	const engramRequirement = runtimeProfile.services.engram_embed.state;

	const probeEngramEmbed = async (): Promise<boolean> => {
		const baseUrl = ENV.TURBOVEC_SIDECAR_JSONRPC_URL ?? ENV.TURBOVEC_SIDECAR;
		const response = await fetch(`${baseUrl}/health`, {
			signal: AbortSignal.timeout(PROBE_TIMEOUT),
		});
		return response.ok;
	};

	const [dbOk, redisOk, ollamaOk, qdrantOk, neo4jOk, engramOk] = await Promise.all([
		safe(db.execute(sql`SELECT 1`).then(() => true), false),
		redisRequirement === 'disabled' ? Promise.resolve(true) : safe(redis.ping().then(() => true), false),
		safe(
			ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT) })
				.then((r) => r.ok),
			false,
		),
		qdrantRequirement === 'disabled'
			? Promise.resolve(true)
			: safe(
					fetch(`${ENV.QDRANT_URL}/collections`, { signal: AbortSignal.timeout(PROBE_TIMEOUT) }).then(
						(r) => r.ok,
					),
					false,
				),
		neo4jRequirement === 'disabled' ? Promise.resolve(true) : safe(probeNeo4j(), false),
		engramRequirement === 'disabled' ? Promise.resolve(true) : safe(probeEngramEmbed(), false),
	]);

	const serviceStates: Record<string, ServiceState> = {
		postgres: {
			required: runtimeProfile.services.postgres.state === 'required',
			state: runtimeProfile.services.postgres.state,
			ok: runtimeProfile.services.postgres.state === 'disabled' ? true : dbOk,
			latencyMs: runtimeProfile.services.postgres.state === 'disabled' ? 0 : dbOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.postgres.rationale,
		},
		redis: {
			required: runtimeProfile.services.redis.state === 'required',
			state: runtimeProfile.services.redis.state,
			ok: runtimeProfile.services.redis.state === 'disabled' ? true : redisOk,
			latencyMs: runtimeProfile.services.redis.state === 'disabled' ? 0 : redisOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.redis.rationale,
		},
		qdrant: {
			required: runtimeProfile.services.qdrant.state === 'required',
			state: runtimeProfile.services.qdrant.state,
			ok: runtimeProfile.services.qdrant.state === 'disabled' ? true : qdrantOk,
			latencyMs: runtimeProfile.services.qdrant.state === 'disabled' ? 0 : qdrantOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.qdrant.rationale,
		},
		neo4j: {
			required: runtimeProfile.services.neo4j.state === 'required',
			state: runtimeProfile.services.neo4j.state,
			ok: runtimeProfile.services.neo4j.state === 'disabled' ? true : neo4jOk,
			latencyMs: runtimeProfile.services.neo4j.state === 'disabled' ? 0 : neo4jOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.neo4j.rationale,
		},
		ollama: {
			required: runtimeProfile.services.ollama.state === 'required',
			state: runtimeProfile.services.ollama.state,
			ok: runtimeProfile.services.ollama.state === 'disabled' ? true : ollamaOk,
			latencyMs: runtimeProfile.services.ollama.state === 'disabled' ? 0 : ollamaOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.ollama.rationale,
		},
		engram_embed: {
			required: runtimeProfile.services.engram_embed.state === 'required',
			state: runtimeProfile.services.engram_embed.state,
			ok: runtimeProfile.services.engram_embed.state === 'disabled' ? true : engramOk,
			latencyMs: runtimeProfile.services.engram_embed.state === 'disabled' ? 0 : engramOk ? 1 : PROBE_TIMEOUT,
			rationale: runtimeProfile.services.engram_embed.rationale,
		},
	};

	const requiredServiceStates = Object.values(serviceStates).filter((entry) => entry.required);
	const ready = requiredServiceStates.every((entry) => entry.ok);

	return json(
		{
			ready,
			runtimeProfile: {
				profile: runtimeProfile.profile,
				source: runtimeProfile.source,
				manifestVersion: runtimeProfile.manifestVersion,
				services: runtimeProfile.services,
				features: runtimeProfile.features,
				notes: runtimeProfile.notes,
			},
			checks: {
				db: dbOk,
				redis: redisOk,
				ollama: ollamaOk,
				qdrant: qdrantOk,
				neo4j: neo4jOk,
				engram_embed: engramOk,
			},
			services: serviceStates,
			time: new Date().toISOString(),
		},
		{ status: ready ? 200 : 503 },
	);
};
