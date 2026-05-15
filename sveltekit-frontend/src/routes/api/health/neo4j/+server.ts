import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNeo4jDriver } from '$lib/server/neo4j-driver';

/**
 * GET /api/health/neo4j
 * Health check for Neo4j graph database connectivity.
 * Opens a session and runs a simple RETURN 1 query.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ status: 'unavailable', error: 'Unauthorized' }, { status: 401 });
	const timestamp = new Date().toISOString();
	let session: ReturnType<ReturnType<typeof getNeo4jDriver>['session']> | null = null;

	try {
		const driver = getNeo4jDriver();
		session = driver.session();
		await session.run('RETURN 1 AS ok');

		return json({
			status: 'healthy',
			service: 'neo4j',
			timestamp,
		});
	} catch (error: unknown) {
		console.warn('[Neo4j Health] Neo4j unavailable:', error);

		return json(
			{
				status: 'unavailable',
				service: 'neo4j',
				message: 'Neo4j not configured or unreachable',
				timestamp,
			},
			{ status: 503 }
		);
	} finally {
		if (session) {
			try {
				await session.close();
			} catch {
				/* ignore close errors */
			}
		}
	}
};
