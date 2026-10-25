import { createHash } from 'node:crypto';

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

function escapeOboText(value) {
	return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
}

function externalId(groupId) {
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(groupId)) {
		throw new Error('DOMAIN_GROUP_ID_UNSUPPORTED_FOR_OBO');
	}
	return `ATLAS-DOMAIN:${groupId}`;
}

export function buildDomainTaxonomyOaklibSnapshotV1(inputRows) {
	if (!Array.isArray(inputRows) || inputRows.length === 0 || inputRows.length > 512) {
		throw new Error('DOMAIN_TAXONOMY_ROWS_INVALID');
	}

	const rows = inputRows.map((row) => ({
		groupId: String(row.group_id ?? '').trim(),
		groupLabel: String(row.group_label ?? '').trim(),
		parentGroupId: row.parent_group_id == null ? null : String(row.parent_group_id).trim() || null,
		description: row.description == null ? null : String(row.description).trim() || null,
		taxonomyLevel: Number(row.taxonomy_level),
	})).sort((left, right) => left.groupId.localeCompare(right.groupId, 'en'));

	const rowById = new Map();
	for (const row of rows) {
		if (!row.groupId || !row.groupLabel || !Number.isInteger(row.taxonomyLevel) || row.taxonomyLevel < 0) {
			throw new Error('DOMAIN_TAXONOMY_ROW_INVALID');
		}
		externalId(row.groupId);
		if (rowById.has(row.groupId)) throw new Error('DOMAIN_TAXONOMY_GROUP_ID_DUPLICATED');
		rowById.set(row.groupId, row);
	}

	for (const row of rows) {
		if (row.parentGroupId) {
			const parent = rowById.get(row.parentGroupId);
			if (!parent) throw new Error('DOMAIN_TAXONOMY_PARENT_MISSING');
		}
	}

	const state = new Map();
	const visit = (groupId) => {
		if (state.get(groupId) === 'VISITING') throw new Error('DOMAIN_TAXONOMY_CYCLE');
		if (state.get(groupId) === 'VISITED') return;
		state.set(groupId, 'VISITING');
		const parent = rowById.get(groupId).parentGroupId;
		if (parent) visit(parent);
		state.set(groupId, 'VISITED');
	};
	for (const row of rows) visit(row.groupId);
	for (const row of rows) {
		if (row.parentGroupId && row.taxonomyLevel !== rowById.get(row.parentGroupId).taxonomyLevel + 1) {
			throw new Error('DOMAIN_TAXONOMY_LEVEL_MISMATCH');
		}
		if (!row.parentGroupId && row.taxonomyLevel !== 0) {
			throw new Error('DOMAIN_TAXONOMY_ROOT_LEVEL_INVALID');
		}
	}

	const sourceTaxonomyRevision = sha256(canonicalJson(rows));
	const lines = [
		'format-version: 1.2',
		'ontology: parent-atlas-domain-taxonomy',
		`data-version: ${sourceTaxonomyRevision}`,
		'',
	];
	for (const row of rows) {
		lines.push('[Term]', `id: ${externalId(row.groupId)}`, `name: ${escapeOboText(row.groupLabel)}`);
		if (row.description) lines.push(`def: "${escapeOboText(row.description)}" []`);
		if (row.parentGroupId) {
			const parent = rowById.get(row.parentGroupId);
			lines.push(`is_a: ${externalId(parent.groupId)} ! ${escapeOboText(parent.groupLabel)}`);
		}
		lines.push('');
	}
	const oboText = `${lines.join('\n')}\n`;
	const oboBytes = Buffer.from(oboText, 'utf8');
	const groupIdMap = rows.map((row) => ({ externalId: externalId(row.groupId), groupId: row.groupId }));
	return {
		oboText,
		rows,
		sourceTaxonomyRevision,
		ontologyRevision: sha256(oboBytes),
		groupIdMap,
		parentEdgeCount: rows.filter((row) => row.parentGroupId).length,
	};
}

export function buildDomainTaxonomyOaklibReceiptV1(snapshot, artifactPath, observedAt = new Date().toISOString()) {
	const body = {
		schema: 'atlas.domain-taxonomy-oaklib-snapshot.v1',
		status: 'SHADOW_SNAPSHOT',
		observedAt,
		sourceOwner: 'postgresql18.public.atlas_domain_ontology',
		sourceTaxonomyRevision: snapshot.sourceTaxonomyRevision,
		ontologyRevision: snapshot.ontologyRevision,
		rowCount: snapshot.rows.length,
		parentEdgeCount: snapshot.parentEdgeCount,
		groupIdMap: snapshot.groupIdMap,
		artifactPath,
		canonicalAuthority: false,
		databaseWritesPerformed: false,
	};
	return { ...body, receiptChecksum: sha256(canonicalJson(body)) };
}

export function verifyDomainTaxonomyOaklibReceiptV1(receipt) {
	if (!receipt || typeof receipt !== 'object' || typeof receipt.receiptChecksum !== 'string') return false;
	const { receiptChecksum, ...body } = receipt;
	return receiptChecksum === sha256(canonicalJson(body));
}
