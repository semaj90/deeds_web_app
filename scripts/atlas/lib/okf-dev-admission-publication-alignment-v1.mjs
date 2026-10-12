const sha256Hex = /^[a-f0-9]{64}$/;

export function alignOkfPublishedPagesToAdmissionEnvelopesV1(corpusEntries, envelopes) {
	const blockers = [];
	if (!Array.isArray(corpusEntries) || !Array.isArray(envelopes)) {
		return { result: 'OKF_ADMISSION_ALIGNMENT_BLOCKED', matchedPages: 0, blockers: [{ code: 'INPUTS_NOT_ARRAYS' }] };
	}

	const corpusByIdentity = new Map();
	for (const entry of corpusEntries) {
		if (!entry || typeof entry.source_id !== 'string' || typeof entry.url !== 'string' || typeof entry.content_hash !== 'string') {
			blockers.push({ code: 'PUBLISHED_ENTRY_IDENTITY_INCOMPLETE' });
			continue;
		}
		const key = `${entry.source_id}\u0000${entry.url}`;
		if (corpusByIdentity.has(key)) blockers.push({ code: 'PUBLISHED_PAGE_IDENTITY_DUPLICATE', sourceId: entry.source_id, url: entry.url });
		else corpusByIdentity.set(key, entry);
	}

	const envelopeIdentities = new Set();
	const matchedIdentities = new Set();
	const contentHashMismatches = [];
	const candidateLocatorMatches = [];
	const unqualifiedDocumentCoordinates = [];
	const unqualifiedDigestComparisons = [];
	let matchedPages = 0;
	for (const envelope of envelopes) {
		const sourceId = envelope?.sourceId;
		const page = envelope?.page;
		if (typeof sourceId !== 'string' || typeof page?.url !== 'string' || typeof page?.contentHash !== 'string') {
			blockers.push({ code: 'ADMISSION_ENVELOPE_IDENTITY_INCOMPLETE' });
			continue;
		}
		const key = `${sourceId}\u0000${page.url}`;
		if (envelopeIdentities.has(key)) blockers.push({ code: 'ADMISSION_ENVELOPE_IDENTITY_DUPLICATE', sourceId, url: page.url });
		envelopeIdentities.add(key);
		const entry = corpusByIdentity.get(key);
		if (!entry) {
			blockers.push({ code: 'PUBLISHED_PAGE_NOT_FOUND_FOR_ENVELOPE', sourceId, url: page.url });
			continue;
		}
		candidateLocatorMatches.push({ sourceId, url: page.url });
		const publishedCoordinate = entry.doc_coordinate;
		const envelopeCoordinate = { provider: page.provider, product: page.product, product_version: page.productVersion, url: page.url };
		const coordinateFields = ['provider', 'product', 'product_version', 'url'];
		const coordinateComplete = publishedCoordinate && coordinateFields.every((field) =>
			typeof publishedCoordinate[field] === 'string' && publishedCoordinate[field].length > 0
			&& typeof envelopeCoordinate[field] === 'string' && envelopeCoordinate[field].length > 0);
		if (!coordinateComplete || coordinateFields.some((field) => publishedCoordinate[field] !== envelopeCoordinate[field])) {
			unqualifiedDocumentCoordinates.push({ sourceId, url: page.url, publishedCoordinate: publishedCoordinate ?? null, envelopeCoordinate });
			blockers.push({ code: 'DOC_COORDINATE_UNAVAILABLE_OR_MISMATCHED', sourceId, url: page.url });
			continue;
		}
		matchedIdentities.add(key);
		if (typeof entry.content_hash_kind !== 'string' || typeof page.contentHashKind !== 'string' || entry.content_hash_kind !== page.contentHashKind) {
			unqualifiedDigestComparisons.push({ sourceId, url: page.url, publishedDigestKind: entry.content_hash_kind ?? null, envelopeDigestKind: page.contentHashKind ?? null });
			blockers.push({ code: 'CONTENT_DIGEST_GRAIN_UNQUALIFIED', sourceId, url: page.url });
			continue;
		}
		if (!sha256Hex.test(page.contentHash) || page.contentHash !== entry.content_hash) {
			contentHashMismatches.push({ sourceId, url: page.url, publishedContentHash: entry.content_hash, envelopeContentHash: page.contentHash });
			blockers.push({ code: 'PUBLISHED_PAGE_CONTENT_HASH_MISMATCH', sourceId, url: page.url });
		} else matchedPages++;
	}

	const publishedPagesWithoutEnvelope = [...corpusByIdentity.entries()]
		.filter(([key]) => !envelopeIdentities.has(key))
		.map(([, entry]) => ({ sourceId: entry.source_id, url: entry.url }));
	for (const page of publishedPagesWithoutEnvelope) {
		blockers.push({ code: 'ADMISSION_ENVELOPE_MISSING_FOR_PUBLISHED_PAGE', ...page });
	}
	const envelopesWithoutPublishedPage = [...envelopeIdentities]
		.filter((key) => !corpusByIdentity.has(key))
		.map((key) => {
			const [sourceId, url] = key.split('\u0000');
			return { sourceId, url };
		});
	const sourceIds = new Set([
		... [...corpusByIdentity.values()].map((entry) => entry.source_id),
		... [...envelopeIdentities].map((key) => key.slice(0, key.indexOf('\u0000'))),
	]);
	const sourceCoverage = [...sourceIds].sort().map((sourceId) => {
		const countForSource = (items, getSourceId) => items.filter((item) => getSourceId(item) === sourceId).length;
		return {
			sourceId,
			publishedPages: countForSource([...corpusByIdentity.values()], (entry) => entry.source_id),
			admissionEnvelopes: countForSource([...envelopeIdentities], (key) => key.slice(0, key.indexOf('\u0000'))),
			exactIdentityMatches: countForSource([...matchedIdentities], (key) => key.slice(0, key.indexOf('\u0000'))),
			contentHashMismatches: countForSource(contentHashMismatches, (item) => item.sourceId),
			publishedPagesWithoutEnvelope: countForSource(publishedPagesWithoutEnvelope, (item) => item.sourceId),
			envelopesWithoutPublishedPage: countForSource(envelopesWithoutPublishedPage, (item) => item.sourceId),
		};
	});

	return {
		result: blockers.length ? 'OKF_ADMISSION_ALIGNMENT_BLOCKED' : 'OKF_ADMISSION_ALIGNMENT_MATCHED',
		matchedPages,
		coverage: {
			publishedPages: corpusByIdentity.size,
			admissionEnvelopes: envelopeIdentities.size,
			exactIdentityMatches: matchedIdentities.size,
			contentHashMismatches,
			candidateLocatorMatches,
			unqualifiedDocumentCoordinates,
			unqualifiedDigestComparisons,
			publishedPagesWithoutEnvelope,
			envelopesWithoutPublishedPage,
			sourceCoverage,
		},
		blockers
	};
}
