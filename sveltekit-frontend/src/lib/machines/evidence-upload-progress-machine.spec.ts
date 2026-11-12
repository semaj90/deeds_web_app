import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { evidenceUploadProgressMachine } from './evidence-upload-progress-machine';

describe('evidence upload progress presentation machine', () => {
	it('accepts server progress monotonically and completes only on a completion event', () => {
		const actor = createActor(evidenceUploadProgressMachine).start();
		actor.send({ type: 'PROGRESS', progress: 62, step: 'embedding', message: 'Embedding' });
		actor.send({ type: 'PROGRESS', progress: 40, step: 'extracting', message: 'Late event' });
		expect(actor.getSnapshot().context.progress).toBe(62);
		expect(actor.getSnapshot().context.step).toBe('embedding');
		expect(actor.getSnapshot().matches('processing')).toBe(true);
		actor.send({ type: 'COMPLETE', message: 'Done', evidenceId: 'evidence-1' });
		expect(actor.getSnapshot().matches('complete')).toBe(true);
		expect(actor.getSnapshot().context.progress).toBe(100);
		actor.stop();
	});

	it('keeps failures distinct from successful completion and permits status reconnect', () => {
		const actor = createActor(evidenceUploadProgressMachine).start();
		actor.send({ type: 'FAILED', message: 'Worker unavailable' });
		expect(actor.getSnapshot().matches('failed')).toBe(true);
		expect(actor.getSnapshot().context.error).toBe('Worker unavailable');
		actor.send({ type: 'RECONNECT' });
		expect(actor.getSnapshot().matches('connecting')).toBe(true);
		actor.stop();
	});

	it('reports an unavailable progress stream without claiming the evidence job failed', () => {
		const actor = createActor(evidenceUploadProgressMachine).start();
		actor.send({ type: 'STREAM_ENDED', message: 'Progress history expired; refresh the status.' });
		expect(actor.getSnapshot().matches('unavailable')).toBe(true);
		expect(actor.getSnapshot().matches('failed')).toBe(false);
		expect(actor.getSnapshot().context.message).toContain('Progress history expired');
		expect(actor.getSnapshot().context.error).toBeNull();
		actor.stop();
	});
});
