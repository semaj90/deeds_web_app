import { describe, expect, it } from 'vitest';
import { dispatchOrExecuteInline } from './dispatch-inline.js';

describe('evidence processing ownership', () => {
	it('rejects evidence.process before RabbitMQ or inline dispatch', async () => {
		await expect(dispatchOrExecuteInline('evidence.process', {
			evidenceId: 'evidence-1',
			text: 'untrusted placeholder',
		})).rejects.toThrow('EVIDENCE_PROCESS_REQUIRES_DURABLE_ANALYSIS_JOB');
	});
});
