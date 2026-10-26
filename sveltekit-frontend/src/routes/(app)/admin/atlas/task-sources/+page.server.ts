import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
	openspecTaskSourceIndexV1,
	openspecTaskSourceSnapshotsV1,
} from '$lib/server/db/schema/openspec-task-source-index.js';

const PAGE_SIZE = 50;
const identityStates = ['ALL', 'DECLARED_ID', 'DERIVED_ID', 'AMBIGUOUS'] as const;

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas/task-sources');
	if (locals.user.role !== 'admin') throw redirect(303, '/admin/atlas');

	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
	const requestedIdentity = url.searchParams.get('identity') ?? 'ALL';
	const identity = identityStates.includes(requestedIdentity as (typeof identityStates)[number])
		? requestedIdentity
		: 'ALL';
	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100_000) : 1;

	const [latest] = await db
		.select()
		.from(openspecTaskSourceSnapshotsV1)
		.orderBy(desc(openspecTaskSourceSnapshotsV1.createdAt))
		.limit(1);

	if (!latest) {
		return { snapshot: null, rows: [], total: 0, query, identity, page, pageSize: PAGE_SIZE };
	}

	const filters = [
		eq(openspecTaskSourceIndexV1.snapshotId, latest.snapshotId),
		eq(openspecTaskSourceIndexV1.archived, false),
	];
	if (identity !== 'ALL') filters.push(eq(openspecTaskSourceIndexV1.identityStatus, identity));
	if (query) {
		const pattern = `%${escapeLike(query)}%`;
		filters.push(or(
			ilike(openspecTaskSourceIndexV1.sourceRef, pattern),
			ilike(openspecTaskSourceIndexV1.changeId, pattern),
			ilike(openspecTaskSourceIndexV1.taskText, pattern),
		)!);
	}
	const where = and(...filters);
	const [countRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(openspecTaskSourceIndexV1)
		.where(where);
	const rows = await db
		.select({
			sourceRef: openspecTaskSourceIndexV1.sourceRef,
			changeId: openspecTaskSourceIndexV1.changeId,
			sourceLine: openspecTaskSourceIndexV1.sourceLine,
			taskText: openspecTaskSourceIndexV1.taskText,
			taskHash: openspecTaskSourceIndexV1.taskHash,
			identityStatus: openspecTaskSourceIndexV1.identityStatus,
			canonicalTaskKeyCandidate: openspecTaskSourceIndexV1.canonicalTaskKeyCandidate,
		})
		.from(openspecTaskSourceIndexV1)
		.where(where)
		.orderBy(asc(openspecTaskSourceIndexV1.sourceRef))
		.limit(PAGE_SIZE)
		.offset((page - 1) * PAGE_SIZE);

	return {
		snapshot: {
			id: latest.snapshotId,
			workspaceRevision: latest.workspaceRevision,
			inputChecksum: latest.inputChecksum,
			indexedRows: latest.sourceRowCount,
			createdAt: latest.createdAt.toISOString(),
			currentness: 'NOT_VERIFIED' as const,
			sourceRevision: 'NOT_RECORDED' as const,
		},
		rows,
		total: countRow?.count ?? 0,
		query,
		identity,
		page,
		pageSize: PAGE_SIZE,
	};
};
