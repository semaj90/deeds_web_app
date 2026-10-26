import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';
import { buildFeatureDescriptionV1 } from '../contracts/feature-description-v1.js';
import { featureRowV1ToFloat32, FeatureRowV1Schema, type FeatureRowV1 } from '../ranking/feature-row-v1.js';
import { joinFeatureRowAndDescriptionV1 } from './feature-row-description-join-v1.js';

const bytes = Buffer.from('export function lookup() { return true; }');
const digest = createHash('sha256').update(bytes).digest('hex');
const locator: EvidenceLocatorV1 = {
	schema: 'atlas.evidence-locator.v1',
	canonicalId: 'symbol:src/lookup.ts:lookup',
	packetKey: 'packet:lookup',
	sourceRef: 'src/lookup.ts',
	sourceKind: 'code_file',
	filePath: 'src/lookup.ts',
	sourceUrl: null,
	contentHash: `sha256:${digest}`,
	workspaceRevision: `sha256:${'b'.repeat(64)}`,
	sourceRevision: `sha256:${digest}`,
	span: { startByte: 0, endByte: bytes.byteLength },
	domain: null,
};
const row: FeatureRowV1 = {
	schema: 'atlas.feature-row.v1',
	packetKey: locator.packetKey!,
	canonicalId: locator.canonicalId,
	sourceRef: locator.sourceRef,
	featureRevision: 'feature-r1',
	workspaceRevision: locator.workspaceRevision,
	sourceRevision: locator.sourceRevision,
	graphRevision: 'graph-r1',
	semanticRevision: 'semantic-r1',
	dense: 0.8,
	sparse: 0.4,
	rrf: 0.7,
	ast: 0.9,
	pagerankAuthority: 0.5,
	pprAffinity: null,
	domainAffinity: 0.6,
	freshness: 1,
	crossEncoder: null,
	executionUtility: 0.2,
	evidenceRefs: ['evidence:source'],
};
const description = buildFeatureDescriptionV1({
	locator,
	featureRevision: row.featureRevision,
	summary: 'Looks up a value and returns a boolean result.',
	evidence: [{
		evidenceRef: 'evidence:source',
		canonicalId: locator.canonicalId,
		packetKey: locator.packetKey,
		sourceRef: locator.sourceRef,
		sourceKind: locator.sourceKind,
		filePath: locator.filePath,
		sourceRevision: locator.sourceRevision,
		workspaceRevision: locator.workspaceRevision,
		contentHash: locator.contentHash,
		spanDigest: `sha256:${digest}`,
		span: locator.span!,
		role: 'AST',
	}],
});

describe('FeatureRow and feature description join', () => {
	it('joins by canonical identity and revisions while retaining separate numeric and descriptive payloads', () => {
		const joined = joinFeatureRowAndDescriptionV1({
			featureRow: row,
			description,
			sourceBytesByEvidenceRef: new Map([['evidence:source', bytes]]),
		});
		expect(joined).toMatchObject({
			schema: 'atlas.feature-row-description-join.v1',
			featureRow: { canonicalId: row.canonicalId, featureRevision: row.featureRevision, dense: row.dense },
			description: { summary: description.summary, status: 'PROPOSAL_ONLY' },
			byteVerification: { status: 'BYTES_AND_SPANS_MATCHED', verifiedEvidenceRefs: ['evidence:source'] },
			writesPerformed: false,
			canonicalAuthority: false,
		});
		expect(joined.featureRow).not.toHaveProperty('summary');
		expect(FeatureRowV1Schema.safeParse({ ...row, featureDescription: description }).success).toBe(false);
		expect(Array.from(featureRowV1ToFloat32(joined.featureRow))).toEqual(Array.from(featureRowV1ToFloat32(row)));
	});

	it.each([
		['sourceRevision', { evidence: description.evidence.map((item) => ({ ...item, sourceRevision: `sha256:${'f'.repeat(64)}` })) }, 'SOURCE_REVISION'],
	] as const)('refuses an identity/revision mismatch (%s)', (_name, override, expected) => {
		const changed = { ...description, ...override };
		expect(() => joinFeatureRowAndDescriptionV1({
			featureRow: row,
			description: changed,
			sourceBytesByEvidenceRef: new Map([['evidence:source', bytes]]),
		})).toThrow(`FEATURE_DESCRIPTION_JOIN_${expected}_MISMATCH`);
	});

	it('rejects a description whose evidence does not identify its declared feature', () => {
		const changed = { ...description, canonicalId: 'symbol:other' };
		expect(() => joinFeatureRowAndDescriptionV1({
			featureRow: row,
			description: changed,
			sourceBytesByEvidenceRef: new Map([['evidence:source', bytes]]),
		})).toThrow('DESCRIPTION_PRIMARY_EVIDENCE_MISSING');
	});

	it('rejects a description whose evidence belongs to another workspace revision', () => {
		const changed = { ...description, workspaceRevision: `sha256:${'e'.repeat(64)}` };
		expect(() => joinFeatureRowAndDescriptionV1({
			featureRow: row,
			description: changed,
			sourceBytesByEvidenceRef: new Map([['evidence:source', bytes]]),
		})).toThrow('DESCRIPTION_EVIDENCE_WORKSPACE_REVISION_MISMATCH');
	});

	it('refuses a caller-asserted reviewed label without the reviewed-label owner', () => {
		const forgedReviewed = { ...description, status: 'REVIEWED' as const, producer: 'HUMAN_REVIEW' as const };
		expect(() => joinFeatureRowAndDescriptionV1({
			featureRow: row,
			description: forgedReviewed,
			sourceBytesByEvidenceRef: new Map([['evidence:source', bytes]]),
		})).toThrow('FEATURE_DESCRIPTION_REVIEWED_OWNER_REQUIRED');
	});
});
