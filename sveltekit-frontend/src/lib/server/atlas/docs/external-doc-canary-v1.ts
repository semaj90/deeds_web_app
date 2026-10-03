/**
 * DOC-CANARY-ADMISSION-01 support: run the REAL `admitExternalDocPage` inside one outer transaction that is always rolled back.
 *
 * `admitExternalDocPage` owns its own BEGIN/COMMIT (and ROLLBACK on error). To canary it without a durable write, the pool it receives
 * is wrapped so that on a single shared client its transaction control is mapped onto savepoints:
 *   BEGIN -> SAVEPOINT, COMMIT -> RELEASE SAVEPOINT, ROLLBACK -> ROLLBACK TO SAVEPOINT, release() -> no-op.
 * The caller owns the outer BEGIN and the final ROLLBACK, so nothing the writer "commits" can outlive the canary.
 * No database access happens in this module unless the caller passes a real pool.
 */

interface QueryClient {
	query(text: string, values?: unknown[]): Promise<unknown>;
}

export interface CanaryPoolLike {
	connect(): Promise<QueryClient & { release(): void }>;
}

const SAVEPOINT = 'atlas_doc_canary_sp';

export function mapTransactionControl(sql: string): string | null {
	const s = sql.trim().replace(/;$/, '').toUpperCase();
	if (s === 'BEGIN') return `SAVEPOINT ${SAVEPOINT}`;
	if (s === 'COMMIT') return `RELEASE SAVEPOINT ${SAVEPOINT}`;
	if (s === 'ROLLBACK') return `ROLLBACK TO SAVEPOINT ${SAVEPOINT}`;
	return null;
}

/** Wrap one client (already inside the caller's outer transaction) so the writer's BEGIN/COMMIT/ROLLBACK become savepoints. */
export function wrapClientAsSavepointPool(client: QueryClient): CanaryPoolLike {
	const proxy = {
		query(text: string, values?: unknown[]) {
			const mapped = typeof text === 'string' ? mapTransactionControl(text) : null;
			return client.query(mapped ?? text, values);
		},
		release() {
			/* the caller keeps the client until its final ROLLBACK */
		}
	};
	return { connect: async () => proxy };
}

/** Deterministic canary page selection: the first page of each of the first `count` sources by sourceId (stable, no randomness). */
export function selectCanaryEnvelopes<T extends { sourceId: string; page: { url: string } }>(envelopes: T[], count: number): T[] {
	const bySource = new Map<string, T>();
	for (const e of [...envelopes].sort((a, b) => (a.sourceId + a.page.url).localeCompare(b.sourceId + b.page.url))) {
		if (!bySource.has(e.sourceId)) bySource.set(e.sourceId, e);
	}
	return [...bySource.values()].slice(0, count);
}
