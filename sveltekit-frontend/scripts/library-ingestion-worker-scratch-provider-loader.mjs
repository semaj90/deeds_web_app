const fixtureModules = new Map([
	['$lib/server/grpc/embedding-client.js', `
		export async function generateEmbeddings(texts) {
			console.log('[scratch-fixture] embedding provider called');
			return {
				vectors: texts.map(() => Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0)),
				model: 'scratch-fixture-only', dimension: 768, source: 'fixture',
				modelArtifactRevision: 'scratch-fixture-v1', totalMs: 0
			};
		}
	`],
	['$lib/server/vector/qdrant-manager.js', `
		export const qdrant = {
			async batchUpsert(input) {
				console.log('[scratch-fixture] Qdrant projection called; points=' + input.points.length);
				return { status: 'fixture-only' };
			}
		};
	`],
	['$lib/server/neo4j-driver.js', `
		export function getNeo4jDriver() {
			return {
				session() {
					return {
						async run() { console.log('[scratch-fixture] Neo4j projection called'); return { records: [] }; },
						async close() {}
					};
				}
			};
		}
	`],
]);

export async function resolve(specifier, context, nextResolve) {
	const source = fixtureModules.get(specifier);
	if (source) {
		return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}
