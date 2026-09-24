/**
 * DOC-26 composition boundary: manifest delta -> selected versioned envelopes
 * -> exact prior-version readback -> existing resumable canonical admission.
 * This module owns orchestration only; admitExternalDocPage remains the writer.
 */
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
	toExternalDocAdmissionInputV1,
	validateExternalDocAdmissionHandoff,
	type ExternalDocAdmissionEnvelopeV1
} from './external-doc-intelligence-contracts-v1.js';
import { admitExternalDocPage, type ExternalDocAdmissionReceiptV1 } from './external-doc-admission.js';
import {
	classifyPageAdmission,
	loadLivePageState,
	runResumableAdmissionV1,
	summarizePlan,
	type AdmissionPlanV1
} from './external-doc-admission-plan-v1.js';

export interface ManifestRecrawlDeltaV1 {
	schema: 'atlas.external-doc-manifest-recrawl-delta.v1';
	previousManifestRevision: string;
	currentManifestRevision: string;
	entries: { sourceId: string; previousSourceId?: string; decision: string; fromProductVersion?: string; toProductVersion?: string; chunkIdentityVersion?: string }[];
	selectedSourceIds: string[];
	retainedRemovedSourceIds: string[];
	blockers: string[];
	canAcquire: boolean;
	canonicalAuthority: false;
	planChecksum: string;
}

export interface VersionedRecrawlBatchV2 {
	current: ReturnType<typeof toExternalDocAdmissionInputV1>[];
	prior: ReturnType<typeof toExternalDocAdmissionInputV1>[];
	selectedSourceIds: string[];
	versionTransitions: { sourceId: string; from: string; to: string }[];
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

/**
 * Read-side identity check only. Python's versioned chunker remains the ID
 * producer; this recomputes its frozen V2 formula before admission so a
 * transition cannot claim V2 while carrying legacy or placeholder IDs.
 */
export function matchesExpectedExternalDocChunkIdentityV2(
	sourceId: string,
	chunkEvidenceRevision: string,
	chunkId: string
): boolean {
	if (!sourceId.trim() || !/^sha256:[a-f0-9]{64}$/.test(chunkEvidenceRevision)) return false;
	const expected = `doc:v2:${canonicalSha256V1({
		schema: 'atlas.external-doc-chunk-identity.v2',
		sourceId,
		chunkEvidenceRevision
	})}`;
	return chunkId === expected;
}

function assertHandoff(value: unknown, label: string): ExternalDocAdmissionEnvelopeV1[] {
	const result = validateExternalDocAdmissionHandoff(value);
	if (result.result !== 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY') {
		throw new Error(`${label}_HANDOFF_NOT_READY:${result.blockers.map((item) => item.code).join(',')}`);
	}
	return value as ExternalDocAdmissionEnvelopeV1[];
}

/**
 * Selects only sources explicitly admitted by the Python delta planner.
 * Version transitions require both the exact old envelope cohort and the new
 * V2 cohort, so callers cannot accidentally prove preservation with a fake or
 * missing prior version.
 */
export function prepareVersionedRecrawlBatchV2(
	delta: ManifestRecrawlDeltaV1,
	priorEnvelopeValue: unknown,
	currentEnvelopeValue: unknown
): VersionedRecrawlBatchV2 {
	if (delta.schema !== 'atlas.external-doc-manifest-recrawl-delta.v1' || delta.canonicalAuthority !== false) {
		throw new Error('DOC_RECRAWL_DELTA_SCHEMA_OR_AUTHORITY_INVALID');
	}
	if (!/^[a-f0-9]{64}$/.test(delta.planChecksum) || !delta.previousManifestRevision || !delta.currentManifestRevision) {
		throw new Error('DOC_RECRAWL_DELTA_LINEAGE_INVALID');
	}
	const { planChecksum, ...unsignedPlan } = delta;
	const computedPlanChecksum = createHash('sha256').update(stableJson(unsignedPlan), 'utf8').digest('hex');
	if (computedPlanChecksum !== planChecksum) throw new Error('DOC_RECRAWL_DELTA_CHECKSUM_MISMATCH');
	if (!delta.canAcquire || delta.blockers.length) throw new Error(`DOC_RECRAWL_DELTA_BLOCKED:${delta.blockers.join(',')}`);
	if (new Set(delta.selectedSourceIds).size !== delta.selectedSourceIds.length) throw new Error('DOC_RECRAWL_DUPLICATE_SELECTED_SOURCE_ID');
	if (new Set(delta.entries.map((entry) => entry.sourceId)).size !== delta.entries.length) throw new Error('DOC_RECRAWL_DUPLICATE_SOURCE_ENTRY');
	const changed = delta.entries.filter((entry) => entry.decision === 'PRODUCT_VERSION_CHANGED');
	const added = delta.entries.filter((entry) => entry.decision === 'ADDED');
	const supported = new Set([...changed, ...added].map((entry) => entry.sourceId));
	if (supported.size !== delta.selectedSourceIds.length || delta.selectedSourceIds.some((id) => !supported.has(id))) {
		throw new Error('DOC_RECRAWL_SELECTED_SOURCE_DECISION_MISMATCH');
	}
	for (const entry of changed) {
		if (!entry.fromProductVersion || !entry.toProductVersion || entry.fromProductVersion === entry.toProductVersion || !entry.previousSourceId || entry.chunkIdentityVersion !== 'V2') {
			throw new Error(`DOC_RECRAWL_VERSION_TRANSITION_NOT_QUALIFIED:${entry.sourceId}`);
		}
	}

	const priorEnvelopes = assertHandoff(priorEnvelopeValue, 'PRIOR');
	const currentEnvelopes = assertHandoff(currentEnvelopeValue, 'CURRENT');
	if (priorEnvelopes.some((envelope) => envelope.manifestRevision !== delta.previousManifestRevision) ||
		currentEnvelopes.some((envelope) => envelope.manifestRevision !== delta.currentManifestRevision)) {
		throw new Error('DOC_RECRAWL_ENVELOPE_MANIFEST_REVISION_MISMATCH');
	}
	const selected = new Set(delta.selectedSourceIds);
	const current = currentEnvelopes.filter((envelope) => selected.has(envelope.sourceId));
	for (const sourceId of selected) {
		if (!current.some((envelope) => envelope.sourceId === sourceId)) throw new Error(`DOC_RECRAWL_CURRENT_ENVELOPE_MISSING:${sourceId}`);
	}
	for (const entry of changed) {
		const currentForSource = current.filter((envelope) => envelope.sourceId === entry.sourceId);
		if (currentForSource.some((envelope) => envelope.page.productVersion !== entry.toProductVersion || envelope.versionQualification !== 'EXACT_VERSION' && envelope.versionQualification !== 'MAJOR_VERSION')) {
			throw new Error(`DOC_RECRAWL_CURRENT_VERSION_ENVELOPE_MISMATCH:${entry.sourceId}`);
		}
		for (const envelope of currentForSource) {
			for (const chunk of envelope.chunks) {
				if (!matchesExpectedExternalDocChunkIdentityV2(envelope.sourceId, chunk.evidenceRevision, chunk.chunkId)) {
					throw new Error(`DOC_RECRAWL_CURRENT_CHUNK_ID_V2_MISMATCH:${entry.sourceId}:${chunk.ordinal}`);
				}
			}
		}
		const currentUrls = new Set(currentForSource.map((envelope) => envelope.page.url));
		const old = priorEnvelopes.filter((envelope) => envelope.sourceId === entry.previousSourceId && envelope.page.productVersion === entry.fromProductVersion &&
			currentForSource.some((next) => next.page.provider === envelope.page.provider && next.page.product === envelope.page.product &&
				next.page.architecture === envelope.page.architecture));
		const oldUrls = new Set(old.map((envelope) => envelope.page.url));
		if (!old.length || oldUrls.size !== currentUrls.size || [...currentUrls].some((url) => !oldUrls.has(url))) {
			throw new Error(`DOC_RECRAWL_PRIOR_VERSION_ENVELOPE_MISSING_OR_PAGE_SET_CHANGED:${entry.sourceId}`);
		}
	}
	const transitions = changed.map((entry) => ({ sourceId: entry.sourceId, from: entry.fromProductVersion!, to: entry.toProductVersion! }));
	const priorRequired = new Set(transitions.map((entry) => entry.from));
	const priorSourceByVersion = new Map(changed.map((entry) => [`${entry.previousSourceId}\u0000${entry.fromProductVersion}`, true]));
	const priorSelected = priorEnvelopes.filter((envelope) => priorRequired.has(envelope.page.productVersion) &&
		priorSourceByVersion.has(`${envelope.sourceId}\u0000${envelope.page.productVersion}`) &&
		current.some((next) => next.page.provider === envelope.page.provider && next.page.product === envelope.page.product &&
			next.page.architecture === envelope.page.architecture && next.page.url === envelope.page.url));
	return {
		current: current.map(toExternalDocAdmissionInputV1),
		prior: priorSelected.map(toExternalDocAdmissionInputV1),
		selectedSourceIds: [...delta.selectedSourceIds],
		versionTransitions: transitions
	};
}

export interface VersionedRecrawlResultV2 {
	result: 'PLAN_ONLY' | 'ADMITTED_AND_PRIOR_PRESERVED' | 'CONFLICT';
	currentPlan: AdmissionPlanV1;
	priorPlan: AdmissionPlanV1;
	writerCalls: number;
	priorPreserved: boolean | null;
	priorSnapshotBeforeChecksum: string | null;
	priorSnapshotAfterChecksum: string | null;
	receipts: ExternalDocAdmissionReceiptV1[];
}

export interface PriorVersionSnapshotV1 {
	schema: 'atlas.doc-26.prior-version-snapshot.v1';
	pageCount: number;
	chunkCount: number;
	checksum: string;
}

/** Hashes exact canonical page/chunk readbacks in deterministic logical order. */
export function buildPriorVersionSnapshotV1(
	items: { input: ReturnType<typeof toExternalDocAdmissionInputV1>; live: Awaited<ReturnType<typeof loadLivePageState>> }[]
): PriorVersionSnapshotV1 {
	const rows = items.map(({ input, live }) => {
		const classification = classifyPageAdmission(input, live);
		if (classification.classification !== 'ALREADY_ADMITTED_EXACT' || !live.page || !live.pageId) {
			throw new Error(`DOC_RECRAWL_PRIOR_SNAPSHOT_NOT_EXACT:${input.page.url}:${classification.reasons.join(',')}`);
		}
		return {
			pageId: live.pageId,
			page: {
				provider: live.page.provider, product: live.page.product, productVersion: live.page.product_version,
				architecture: live.page.architecture, url: live.page.url, contentHash: live.page.content_hash,
				evidenceRevision: live.page.evidence_revision
			},
			chunks: live.chunks.map((chunk) => ({
				chunkId: chunk.chunk_id, ordinal: Number(chunk.ordinal), startByte: Number(chunk.start_byte), endByte: Number(chunk.end_byte),
				text: chunk.text, chunkChecksum: chunk.chunk_checksum, evidenceRevision: chunk.evidence_revision
			})).sort((a, b) => a.ordinal - b.ordinal || a.chunkId.localeCompare(b.chunkId))
		};
	}).sort((a, b) => a.page.provider.localeCompare(b.page.provider) || a.page.product.localeCompare(b.page.product) ||
		a.page.productVersion.localeCompare(b.page.productVersion) || a.page.url.localeCompare(b.page.url) || a.pageId.localeCompare(b.pageId));
	const chunkCount = rows.reduce((count, row) => count + row.chunks.length, 0);
	const checksum = canonicalSha256V1({ schema: 'atlas.doc-26.prior-version-snapshot.v1', rows });
	return { schema: 'atlas.doc-26.prior-version-snapshot.v1', pageCount: rows.length, chunkCount, checksum };
}

/**
 * Exact-resume orchestration. PLAN_ONLY performs SELECT-only readbacks. APPLY
 * writes missing new-version pages solely through admitExternalDocPage and
 * confirms the prior envelope cohort remains byte-for-byte exact afterward.
 */
export async function reconcileVersionedRecrawlAdmissionV2(
	pool: Pool,
	batch: VersionedRecrawlBatchV2,
	mode: 'PLAN_ONLY' | 'APPLY' = 'PLAN_ONLY'
): Promise<VersionedRecrawlResultV2> {
	const currentItems = await Promise.all(batch.current.map(async (input) => {
		const live = await loadLivePageState(pool as Pool, input);
		return { input, live, result: classifyPageAdmission(input, live) };
	}));
	const priorItems = await Promise.all(batch.prior.map(async (input) => {
		const live = await loadLivePageState(pool as Pool, input);
		return { input, live, result: classifyPageAdmission(input, live) };
	}));
	const currentPlan = summarizePlan(currentItems);
	const priorPlan = summarizePlan(priorItems);
	let priorSnapshotBeforeChecksum: string | null = null;
	if (priorPlan.alreadyAdmitted === priorItems.length && priorPlan.conflicts === 0) {
		priorSnapshotBeforeChecksum = buildPriorVersionSnapshotV1(priorItems).checksum;
	}
	if (!currentPlan.safeToAdmit || !priorPlan.safeToAdmit || priorPlan.missing > 0 || currentPlan.conflicts > 0) {
		return { result: 'CONFLICT', currentPlan, priorPlan, writerCalls: 0, priorPreserved: false, priorSnapshotBeforeChecksum, priorSnapshotAfterChecksum: null, receipts: [] };
	}
	if (mode === 'PLAN_ONLY') return { result: 'PLAN_ONLY', currentPlan, priorPlan, writerCalls: 0, priorPreserved: null, priorSnapshotBeforeChecksum, priorSnapshotAfterChecksum: null, receipts: [] };

	const run = await runResumableAdmissionV1(
		batch.current,
		(input) => loadLivePageState(pool as Pool, input),
		(input) => admitExternalDocPage(pool as Pool, input)
	);
	if (run.result === 'CONFLICT') return { result: 'CONFLICT', currentPlan, priorPlan, writerCalls: 0, priorPreserved: false, priorSnapshotBeforeChecksum, priorSnapshotAfterChecksum: null, receipts: [] };
	const afterPrior = await Promise.all(batch.prior.map(async (input) => {
		const live = await loadLivePageState(pool as Pool, input);
		return { input, live, result: classifyPageAdmission(input, live) };
	}));
	const verifiedPrior = summarizePlan(afterPrior);
	const afterCurrent = await Promise.all(batch.current.map(async (input) => ({ input, result: classifyPageAdmission(input, await loadLivePageState(pool as Pool, input)) })));
	const verifiedCurrent = summarizePlan(afterCurrent);
	const priorSnapshotAfterChecksum = verifiedPrior.alreadyAdmitted === batch.prior.length && verifiedPrior.conflicts === 0
		? buildPriorVersionSnapshotV1(afterPrior).checksum : null;
	const preserved = priorSnapshotBeforeChecksum !== null && priorSnapshotAfterChecksum === priorSnapshotBeforeChecksum &&
		verifiedPrior.alreadyAdmitted === batch.prior.length && verifiedPrior.missing === 0 && verifiedPrior.conflicts === 0;
	if (!preserved || verifiedCurrent.alreadyAdmitted !== batch.current.length || verifiedCurrent.missing || verifiedCurrent.conflicts) {
		throw new Error('DOC_RECRAWL_POST_ADMISSION_READBACK_FAILED');
	}
	return { result: 'ADMITTED_AND_PRIOR_PRESERVED', currentPlan, priorPlan, writerCalls: run.writerCalls, priorPreserved: preserved,
		priorSnapshotBeforeChecksum, priorSnapshotAfterChecksum, receipts: run.receipts };
}
