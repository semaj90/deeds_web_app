import { describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import {
	createMarkerSaveMachine,
	deleteSavedMarker,
	MarkerSaveError,
	type MarkerSaveCommand,
	type MarkerSaveResult
} from './marker-save-machine.js';

const command: MarkerSaveCommand = {
	kind: 'move',
	caseId: '11111111-1111-1111-1111-111111111111',
	sceneKey: 'scene-a',
	markerId: 'aaaaaaaa-0000-0000-0000-000000000001',
	evidenceId: '22222222-2222-2222-2222-222222222222',
	commandId: 'bbbbbbbb-0000-0000-0000-000000000001',
	expectedRevision: 1,
	position: { x: 1, y: 2, z: 3 }
};

const ok: MarkerSaveResult = { markerId: command.markerId, revision: 2, position: command.position };

function flush() {
	return new Promise((r) => setTimeout(r, 0));
}

describe('marker-save machine', () => {
	it('soft-deletes a saved marker through the case-scoped endpoint', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { markerId: command.markerId, revision: 4, position: command.position },
			message: 'Deleted'
		}), { status: 200, headers: { 'content-type': 'application/json' } }));
		const result = await deleteSavedMarker({
			caseId: command.caseId,
			sceneKey: command.sceneKey,
			markerId: command.markerId,
			evidenceId: command.evidenceId,
			commandId: command.commandId,
			expectedRevision: 3
		}, fetchFn);

		expect(result.revision).toBe(4);
		expect(fetchFn).toHaveBeenCalledWith(
			`/api/cases/${command.caseId}/scenes/${command.sceneKey}/markers/${command.markerId}`,
			expect.objectContaining({ method: 'DELETE' })
		);
		expect(JSON.parse(fetchFn.mock.calls[0][1].body as string)).toEqual({
			commandId: command.commandId,
			evidenceId: command.evidenceId,
			expectedRevision: 3
		});
	});

	it('preserves the saved marker when delete reports a stale revision', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			success: false, data: { currentRevision: 5 }, message: 'MARKER_CONFLICT'
		}), { status: 409, headers: { 'content-type': 'application/json' } }));
		await expect(deleteSavedMarker({
			caseId: command.caseId,
			sceneKey: command.sceneKey,
			markerId: command.markerId,
			evidenceId: command.evidenceId,
			commandId: command.commandId,
			expectedRevision: 3
		}, fetchFn)).rejects.toMatchObject({ status: 409, currentRevision: 5 });
	});

	it('commits a drop and returns to idle with the server result', async () => {
		const save = vi.fn().mockResolvedValue(ok);
		const actor = createActor(createMarkerSaveMachine(save)).start();

		actor.send({ type: 'DROP', command });
		await flush();

		expect(save).toHaveBeenCalledTimes(1);
		expect(actor.getSnapshot().value).toBe('idle');
		expect(actor.getSnapshot().context.committed).toEqual(ok);
		expect(actor.getSnapshot().context.error).toBeNull();
	});

	it('moves to conflict on 409 and does not retry or overwrite', async () => {
		const save = vi.fn().mockRejectedValue(new MarkerSaveError(409, 5));
		const actor = createActor(createMarkerSaveMachine(save)).start();

		actor.send({ type: 'DROP', command });
		await flush();

		expect(actor.getSnapshot().value).toBe('conflict');
		expect(actor.getSnapshot().context.conflictRevision).toBe(5);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('RESET from conflict returns to idle without saving again', async () => {
		const save = vi.fn().mockRejectedValue(new MarkerSaveError(409, 5));
		const actor = createActor(createMarkerSaveMachine(save)).start();

		actor.send({ type: 'DROP', command });
		await flush();
		actor.send({ type: 'RESET' });

		expect(actor.getSnapshot().value).toBe('idle');
		expect(save).toHaveBeenCalledTimes(1);
	});

	it('moves to failed on network error and RETRY reuses the same commandId', async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('network down'))
			.mockResolvedValueOnce(ok);
		const actor = createActor(createMarkerSaveMachine(save)).start();

		actor.send({ type: 'DROP', command });
		await flush();
		expect(actor.getSnapshot().value).toBe('failed');
		expect(actor.getSnapshot().context.error).toBe('network down');

		actor.send({ type: 'RETRY' });
		await flush();

		expect(save).toHaveBeenCalledTimes(2);
		expect(save.mock.calls[0][0].commandId).toBe(command.commandId);
		expect(save.mock.calls[1][0].commandId).toBe(command.commandId);
		expect(actor.getSnapshot().value).toBe('idle');
	});

	it('ignores a second DROP while a save is in flight', async () => {
		let release!: (v: MarkerSaveResult) => void;
		const save = vi.fn(() => new Promise<MarkerSaveResult>((r) => (release = r)));
		const actor = createActor(createMarkerSaveMachine(save)).start();

		actor.send({ type: 'DROP', command });
		actor.send({ type: 'DROP', command: { ...command, commandId: 'cccccccc-0000-0000-0000-000000000002' } });
		expect(save).toHaveBeenCalledTimes(1);
		expect(actor.getSnapshot().value).toBe('saving');

		release(ok);
		await flush();
		expect(actor.getSnapshot().value).toBe('idle');
	});
});
