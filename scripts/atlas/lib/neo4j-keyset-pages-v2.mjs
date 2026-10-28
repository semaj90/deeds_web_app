export async function forEachNeo4jKeysetPageV2({ runPage, onRecord, pageSize = 1000, maxRows = 1_000_000 }) {
	if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 10_000) throw new RangeError('NEO4J_PAGE_SIZE_INVALID');
	if (!Number.isSafeInteger(maxRows) || maxRows < pageSize) throw new RangeError('NEO4J_MAX_ROWS_INVALID');
	if (typeof runPage !== 'function' || typeof onRecord !== 'function') throw new TypeError('NEO4J_PAGE_CALLBACK_REQUIRED');
	let rowCount = 0;
	let after = null;
	while (true) {
		const page = await runPage({ after, pageSize });
		if (!Array.isArray(page) || page.length > pageSize) throw new Error('NEO4J_KEYSET_PAGE_INVALID');
		let previous = after;
		for (const record of page) {
			const cursor = record?.cursor;
			if (typeof cursor !== 'string' || !cursor || (previous !== null && cursor <= previous)) {
				throw new Error('NEO4J_KEYSET_CURSOR_NOT_STRICTLY_INCREASING');
			}
			previous = cursor;
		}
		if (rowCount + page.length > maxRows) throw new Error('NEO4J_EXPORT_MAX_ROWS_EXCEEDED');
		for (const record of page) await onRecord(record);
		rowCount += page.length;
		if (page.length < pageSize) return rowCount;
		after = previous;
	}
}

export async function readNeo4jKeysetPagesV2(options) {
	const records = [];
	await forEachNeo4jKeysetPageV2({ ...options, onRecord: (record) => records.push(record) });
	return records;
}
