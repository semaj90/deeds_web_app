import { describe, expect, it } from 'vitest';
import { buildAceExecutionFeedback } from './execution-feedback.js';

const manifest = {
	request_id: 'req-1', manifest_id: 'context:manifest-1', selected_packet_keys: ['packet-1'], selected_process_ids: ['process-1'],
} as never;

describe('ACE execution feedback bridge', () => {
	it('maps successful validated execution to helpful evidence without persistence', () => {
		const feedback = buildAceExecutionFeedback({ manifest, executionId: 'exec-1', success: true, validationPassed: true });
		expect(feedback.helpfulDelta).toBe(1);
		expect(feedback.harmfulDelta).toBe(0);
		expect(feedback.outcome.manifest_id).toBe('context:manifest-1');
	});

	it('maps failed validation to harmful evidence and preserves identity', () => {
		const feedback = buildAceExecutionFeedback({ manifest, executionId: 'exec-2', success: true, validationPassed: false, failureKind: 'validation_failed' });
		expect(feedback.success).toBe(false);
		expect(feedback.harmfulDelta).toBe(1);
		expect(feedback.failureKind).toBe('validation_failed');
		expect(feedback.selectedPacketKeys).toEqual(['packet-1']);
	});
});
