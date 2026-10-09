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
		if (!sha256Hex.test(page.contentHash) || page.contentHash !== entry.content_hash) {
			blockers.push({ code: 'PUBLISHED_PAGE_CONTENT_HASH_MISMATCH', sourceId, url: page.url });
		} else matchedPages++;
	}

	return {
		result: blockers.length ? 'OKF_ADMISSION_ALIGNMENT_BLOCKED' : 'OKF_ADMISSION_ALIGNMENT_MATCHED',
		matchedPages,
		blockers
	};
}
