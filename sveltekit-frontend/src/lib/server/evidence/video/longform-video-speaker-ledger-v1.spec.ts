// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	buildTownHallSimulationProposalsV1,
	checkModelLicenseAdmissionV1,
	DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1,
	planLongformMediaPartitionsV1,
	reconcileOverlappingUtteranceWindowsV1,
	validateLongformVideoExtractionV1
} from './longform-video-speaker-ledger-v1.js';

const EVIDENCE_UUID = '11111111-2222-4333-8444-555555555555';
const SAMPLE_SHA256 = 'a'.repeat(64);

describe('longform-video-speaker-ledger-v1', () => {
	it('enforces license provenance for Depth-Anything-V2, Apache-2.0/MIT defaults over CC-BY pyannote, and excludes synthetic generators from factual evidence', () => {
		for (const modelId of Object.values(DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1)) {
			const admitted = checkModelLicenseAdmissionV1({
				modelId,
				purpose: 'factual_evidence'
			});
			expect(admitted.ok).toBe(true);
			if (admitted.ok) {
				expect(admitted.entry.requiresAttribution).toBe(false);
				expect(['Apache-2.0', 'MIT', 'BSD-2-Clause']).toContain(admitted.entry.license);
			}
		}

		const depthSmall = checkModelLicenseAdmissionV1({
			modelId: 'depth-anything/Depth-Anything-V2-Small-hf',
			claimedLicense: 'Apache-2.0',
			purpose: 'factual_evidence'
		});
		expect(depthSmall.ok).toBe(true);

		const depthLarge = checkModelLicenseAdmissionV1({
			modelId: 'depth-anything/Depth-Anything-V2-Large-hf',
			claimedLicense: 'Apache-2.0',
			purpose: 'factual_evidence'
		});
		expect(depthLarge.ok).toBe(false);
		if (!depthLarge.ok) expect(depthLarge.reason).toBe('MODEL_LICENSE_CLAIM_MISMATCH');

		const depthLargeUnc = checkModelLicenseAdmissionV1({
			modelId: 'depth-anything/Depth-Anything-V2-Large-hf',
			purpose: 'factual_evidence'
		});
		expect(depthLargeUnc.ok).toBe(false);
		if (!depthLargeUnc.ok) expect(depthLargeUnc.reason).toBe('NON_COMMERCIAL_LICENSE_BLOCKED');

		const pyannoteDefault = checkModelLicenseAdmissionV1({
			modelId: 'pyannote/speaker-diarization-community-1',
			purpose: 'factual_evidence'
		});
		expect(pyannoteDefault.ok).toBe(false);
		if (!pyannoteDefault.ok) {
			expect(pyannoteDefault.reason).toBe('CC_BY_ATTRIBUTION_LICENSE_DISALLOWED_BY_DEFAULT');
		}

		const pyannoteOptIn = checkModelLicenseAdmissionV1({
			modelId: 'pyannote/speaker-diarization-community-1',
			purpose: 'factual_evidence',
			allowCcByAttribution: true
		});
		expect(pyannoteOptIn.ok).toBe(true);
		if (pyannoteOptIn.ok) {
			expect(pyannoteOptIn.entry.license).toBe('CC-BY-4.0');
			expect(pyannoteOptIn.entry.requiresAttribution).toBe(true);
		}

		const wespeaker = checkModelLicenseAdmissionV1({
			modelId: 'wespeaker/wespeaker-voxceleb-resnet34-LM',
			claimedLicense: 'Apache-2.0',
			purpose: 'factual_evidence'
		});
		expect(wespeaker.ok).toBe(true);

		const chitraFactual = checkModelLicenseAdmissionV1({
			modelId: 'chitra-tiny-212m',
			purpose: 'factual_evidence'
		});
		expect(chitraFactual.ok).toBe(false);
		if (!chitraFactual.ok) {
			expect(chitraFactual.reason).toBe('SYNTHETIC_IMAGE_MODEL_EXCLUDED_FROM_EVIDENCE');
		}
	});

	it('plans a 4-hour (14,400,000 ms) video into 16 15-minute partitions and 480 overlapping 30-second windows', () => {
		const plan = planLongformMediaPartitionsV1({
			evidenceId: EVIDENCE_UUID,
			sourceSha256: SAMPLE_SHA256,
			durationMs: 14_400_000
		});

		expect(plan.canonicalAuthority).toBe(false);
		expect(plan.writesPerformed).toBe(false);
		expect(plan.sourceSha256).toBe(`sha256:${SAMPLE_SHA256}`);
		expect(plan.partitionCount).toBe(16);
		expect(plan.baselineWindowCount).toBe(480);
		expect(plan.partitions[0]).toEqual({
			partitionIndex: 0,
			partitionId: 'part_0000',
			startMs: 0,
			endMs: 900_000
		});
		expect(plan.partitions[15]).toEqual({
			partitionIndex: 15,
			partitionId: 'part_0015',
			startMs: 13_500_000,
			endMs: 14_400_000
		});
		expect(plan.audioWindows[29]).toMatchObject({
			windowIndex: 29,
			partitionIndex: 0,
			coreStartMs: 870_000,
			coreEndMs: 900_000,
			decodeStartMs: 868_000,
			decodeEndMs: 902_000,
			crossesPartitionBoundary: true
		});
		expect(plan.audioWindows[479]).toMatchObject({
			windowIndex: 479,
			partitionIndex: 15,
			coreStartMs: 14_370_000,
			coreEndMs: 14_400_000,
			decodeEndMs: 14_400_000
		});
	});

	it('deduplicates boundary-split utterances per speaker while preserving multi-speaker overlapping speech', () => {
		const reconciled = reconcileOverlappingUtteranceWindowsV1([
			{
				windowIndex: 0,
				speaker_id: 'spk_01',
				start_ms: 28_500,
				end_ms: 31_200,
				text: 'We need to inspect the damaged gate',
				source_segment_ids: ['seg_w0_01'],
				claim_label: 'action_request'
			},
			{
				windowIndex: 1,
				speaker_id: 'spk_01',
				start_ms: 28_500,
				end_ms: 31_800,
				text: 'We need to inspect the damaged gate before anyone enters.',
				source_segment_ids: ['seg_w1_01']
			},
			{
				windowIndex: 1,
				speaker_id: 'spk_02',
				start_ms: 30_900,
				end_ms: 35_000,
				text: 'I will ask maintenance for a cost estimate this afternoon.',
				source_segment_ids: ['seg_w1_02'],
				claim_label: 'commitment'
			}
		]);

		expect(reconciled).toHaveLength(2);
		expect(reconciled[0]).toEqual({
			speaker_id: 'spk_01',
			start_ms: 28_500,
			end_ms: 31_800,
			text: 'We need to inspect the damaged gate before anyone enters.',
			source_segment_ids: ['seg_w0_01', 'seg_w1_01'],
			claim_label: 'action_request'
		});
		expect(reconciled[1].speaker_id).toBe('spk_02');
	});

	it('validates the 3-speaker damaged-gate fixture, blocks hallucinated refs/approvals, and builds Town Hall proposals', () => {
		const validFixture = {
			source: {
				evidence_id: EVIDENCE_UUID,
				sha256: `sha256:${SAMPLE_SHA256}`,
				duration_ms: 14_400_000
			},
			speakers: [
				{ speaker_id: 'spk_01', identity: null, identity_status: 'unverified' as const },
				{ speaker_id: 'spk_02', identity: null, identity_status: 'unverified' as const },
				{ speaker_id: 'spk_03', identity: null, identity_status: 'unverified' as const }
			],
			utterances: [
				{
					speaker_id: 'spk_01',
					start_ms: 723_000,
					end_ms: 730_000,
					text: 'We need to inspect the damaged gate before anyone enters.',
					source_segment_ids: ['seg_000401'],
					claim_label: 'action_request' as const
				},
				{
					speaker_id: 'spk_02',
					start_ms: 731_000,
					end_ms: 739_000,
					text: "I'll ask maintenance for a cost estimate this afternoon.",
					source_segment_ids: ['seg_000402'],
					claim_label: 'commitment' as const
				},
				{
					speaker_id: 'spk_03',
					start_ms: 740_000,
					end_ms: 746_000,
					text: 'Please document the condition and photograph both entrances.',
					source_segment_ids: ['seg_000403'],
					claim_label: 'action_request' as const
				}
			],
			summary: {
				sentences: [
					'Three speakers discussed a damaged gate, requested an inspection and entrance photographs, and proposed a maintenance estimate.',
					'No repair or approved budget was confirmed.'
				],
				source_segment_ids: ['seg_000401', 'seg_000402', 'seg_000403']
			},
			recommendations: [
				{
					action: 'Schedule gate inspection.',
					status: 'proposed' as const,
					priority: 'requires_review' as const,
					proposed_by_speaker_id: 'spk_01',
					source_segment_ids: ['seg_000401']
				},
				{
					action: 'Request maintenance quotation.',
					status: 'proposed' as const,
					priority: 'requires_review' as const,
					estimated_budget_usd: 1200,
					approved_budget_usd: null,
					proposed_by_speaker_id: 'spk_02',
					source_segment_ids: ['seg_000402']
				},
				{
					action: 'Document and photograph both entrances.',
					status: 'proposed' as const,
					priority: 'requires_review' as const,
					proposed_by_speaker_id: 'spk_03',
					source_segment_ids: ['seg_000403']
				}
			]
		};

		const validation = validateLongformVideoExtractionV1(validFixture);
		expect(validation.ok).toBe(true);
		expect(validation.canonicalAuthority).toBe(false);
		expect(validation.writesPerformed).toBe(false);

		const halluSegment = validateLongformVideoExtractionV1({
			...validFixture,
			recommendations: [
				{
					action: 'Schedule gate inspection.',
					status: 'proposed',
					priority: 'requires_review',
					source_segment_ids: ['seg_999999']
				}
			]
		});
		expect(halluSegment.ok).toBe(false);
		if (!halluSegment.ok) {
			expect(halluSegment.errors[0]).toContain('UNKNOWN_RECOMMENDATION_SEGMENT_REF:seg_999999');
		}

		const autoApproved = validateLongformVideoExtractionV1({
			...validFixture,
			recommendations: [
				{
					action: 'Auto-approve spending.',
					status: 'approved',
					priority: 'high',
					approved_budget_usd: 1200,
					source_segment_ids: ['seg_000401']
				}
			]
		});
		expect(autoApproved.ok).toBe(false);

		const townHall = buildTownHallSimulationProposalsV1(validFixture);
		expect(townHall.ok).toBe(true);
		expect(townHall.canonicalAuthority).toBe(false);
		expect(townHall.writesPerformed).toBe(false);
		expect(townHall.proposals).toHaveLength(3);
		expect(townHall.proposals[0]).toMatchObject({
			arenaSlotIndex: 0,
			townHallBuilding: 'PUBLIC_WORKS',
			citizenSpeakerId: 'spk_01',
			sourceTimestampRangeMs: [723_000, 730_000],
			approvedBudgetUsd: null,
			fsmState: 'HOLD_FOR_HUMAN_REVIEW'
		});
		expect(townHall.proposals[1]).toMatchObject({
			arenaSlotIndex: 1,
			townHallBuilding: 'TREASURY',
			citizenSpeakerId: 'spk_02',
			sourceTimestampRangeMs: [731_000, 739_000],
			estimatedBudgetUsd: 1200,
			approvedBudgetUsd: null,
			simulatedBudgetRangeUsd: [0, 2000]
		});
		expect(townHall.proposals[2]).toMatchObject({
			arenaSlotIndex: 2,
			townHallBuilding: 'ARCHIVE',
			citizenSpeakerId: 'spk_03',
			sourceTimestampRangeMs: [740_000, 746_000]
		});
	});
});
