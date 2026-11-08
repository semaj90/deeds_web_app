/**
 * Marker-save workflow (XState v5). One command per pointer release.
 *
 *   idle --DROP--> saving --ok--> idle (committed)
 *   saving --409--> conflict  (no silent overwrite; user resets to the server revision)
 *   saving --other error--> failed --RETRY--> saving   (same commandId, so the server dedupes)
 *
 * The machine keeps no marker array. Positions stay in the renderer; the server result is
 * the authority. DROP is ignored while a save is in flight.
 */
import { assign, createActor, fromPromise, setup } from 'xstate';

export type MarkerPosition = { x: number; y: number; z: number };

export type MarkerSaveCommand = {
	kind: 'create' | 'move';
	caseId: string;
	sceneKey: string;
	markerId: string;
	evidenceId: string;
	commandId: string;
	/** Required for 'move'; ignored for 'create' (the server sets revision 1). */
	expectedRevision: number;
	position: MarkerPosition;
	label?: string | null;
};

export type MarkerSaveResult = {
	markerId: string;
	revision: number;
	position: MarkerPosition;
	replayed?: boolean;
};

export type MarkerDeleteCommand = {
	caseId: string;
	sceneKey: string;
	markerId: string;
	evidenceId: string;
	commandId: string;
	expectedRevision: number;
};

export class MarkerSaveError extends Error {
	constructor(
		public readonly status: number,
		public readonly currentRevision: number | null,
		message = `Marker save failed: ${status}`
	) {
		super(message);
		this.name = 'MarkerSaveError';
	}
}

export type MarkerSaveContext = {
	command: MarkerSaveCommand | null;
	committed: MarkerSaveResult | null;
	error: string | null;
	conflictRevision: number | null;
};

export type MarkerSaveEvent =
	| { type: 'DROP'; command: MarkerSaveCommand }
	| { type: 'RETRY' }
	| { type: 'RESET' };

export type MarkerSaveFn = (command: MarkerSaveCommand, signal: AbortSignal) => Promise<MarkerSaveResult>;

export function createMarkerSaveMachine(save: MarkerSaveFn) {
	return setup({
		types: {
			context: {} as MarkerSaveContext,
			events: {} as MarkerSaveEvent
		},
		actors: {
			saveMarker: fromPromise<MarkerSaveResult, MarkerSaveCommand>(({ input, signal }) =>
				save(input, signal)
			)
		},
		actions: {
			stage: assign({
				command: ({ event }) => (event.type === 'DROP' ? event.command : null),
				error: () => null,
				conflictRevision: () => null
			}),
			committed: assign({
				committed: ({ event }) => (event as unknown as { output: MarkerSaveResult }).output,
				command: () => null,
				error: () => null
			}),
			failed: assign({
				error: ({ event }) => {
					const err = (event as unknown as { error: unknown }).error;
					return err instanceof Error ? err.message : String(err);
				},
				conflictRevision: () => null
			}),
			conflicted: assign({
				error: () => 'MARKER_CONFLICT',
				conflictRevision: ({ event }) => {
					const err = (event as unknown as { error: unknown }).error;
					return err instanceof MarkerSaveError ? err.currentRevision : null;
				}
			}),
			clear: assign({
				command: () => null,
				committed: () => null,
				error: () => null,
				conflictRevision: () => null
			})
		},
		guards: {
			isConflict: ({ event }) => {
				const err = (event as unknown as { error: unknown }).error;
				return err instanceof MarkerSaveError && err.status === 409;
			}
		}
	}).createMachine({
		id: 'marker-save',
		initial: 'idle',
		context: { command: null, committed: null, error: null, conflictRevision: null },
		states: {
			idle: {
				on: {
					DROP: { target: 'saving', actions: 'stage' },
					RESET: { actions: 'clear' }
				}
			},
			saving: {
				invoke: {
					src: 'saveMarker',
					input: ({ context }) => {
						if (!context.command) throw new Error('MARKER_SAVE_WITHOUT_COMMAND');
						return context.command;
					},
					onDone: { target: 'idle', actions: 'committed' },
					onError: [
						{ guard: 'isConflict', target: 'conflict', actions: 'conflicted' },
						{ target: 'failed', actions: 'failed' }
					]
				}
			},
			conflict: {
				on: {
					RESET: { target: 'idle', actions: 'clear' }
				}
			},
			failed: {
				on: {
					RETRY: { target: 'saving' },
					RESET: { target: 'idle', actions: 'clear' }
				}
			}
		}
	});
}

/** Browser/client save: PATCH the SvelteKit endpoint, mapping HTTP errors to MarkerSaveError. */
export function makeClientMarkerSaver(fetchFn: typeof fetch = fetch): MarkerSaveFn {
	return async (command, signal) => {
		const base =
			`/api/cases/${encodeURIComponent(command.caseId)}` +
			`/scenes/${encodeURIComponent(command.sceneKey)}/markers`;
		const isCreate = command.kind === 'create';
		const url = isCreate ? base : `${base}/${encodeURIComponent(command.markerId)}`;
		const payload = isCreate
			? {
					markerId: command.markerId,
					commandId: command.commandId,
					evidenceId: command.evidenceId,
					label: command.label ?? null,
					position: command.position
				}
			: {
					commandId: command.commandId,
					evidenceId: command.evidenceId,
					expectedRevision: command.expectedRevision,
					position: command.position
				};
		const response = await fetchFn(url, {
			method: isCreate ? 'POST' : 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal
		});
		const body = (await response.json().catch(() => null)) as {
			data?: MarkerSaveResult | { currentRevision?: number | null } | null;
		} | null;
		if (!response.ok) {
			const currentRevision =
				body?.data && 'currentRevision' in body.data ? (body.data.currentRevision ?? null) : null;
			throw new MarkerSaveError(response.status, currentRevision);
		}
		return body!.data as MarkerSaveResult;
	};
}

export { createActor };

/** Persist a marker removal through the case-authorized scene-marker endpoint. */
export async function deleteSavedMarker(
	command: MarkerDeleteCommand,
	fetchFn: typeof fetch = fetch
): Promise<MarkerSaveResult> {
	const url = `/api/cases/${encodeURIComponent(command.caseId)}` +
		`/scenes/${encodeURIComponent(command.sceneKey)}/markers/${encodeURIComponent(command.markerId)}`;
	const response = await fetchFn(url, {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			commandId: command.commandId,
			evidenceId: command.evidenceId,
			expectedRevision: command.expectedRevision
		})
	});
	const body = (await response.json().catch(() => null)) as {
		data?: MarkerSaveResult | { currentRevision?: number | null } | null;
		message?: string;
	} | null;
	if (!response.ok || !body?.data || !('revision' in body.data)) {
		const currentRevision = body?.data && 'currentRevision' in body.data ? body.data.currentRevision ?? null : null;
		throw new MarkerSaveError(response.status, currentRevision, body?.message ?? `Marker delete failed: ${response.status}`);
	}
	return body.data;
}

export type SavedMarkerView = {
	markerId: string;
	evidenceId: string;
	label: string | null;
	revision: number;
	position: MarkerPosition;
};

/** Hydration: the saved markers for one scene (GET). Throws on any non-OK response. */
export async function fetchSavedMarkers(
	caseId: string,
	sceneKey: string,
	fetchFn: typeof fetch = fetch
): Promise<SavedMarkerView[]> {
	const url =
		`/api/cases/${encodeURIComponent(caseId)}/scenes/${encodeURIComponent(sceneKey)}/markers`;
	const response = await fetchFn(url, { headers: { accept: 'application/json' } });
	const body = (await response.json().catch(() => null)) as {
		success?: boolean;
		data?: { markers?: SavedMarkerView[] } | null;
	} | null;
	if (!response.ok || !body?.success) {
		throw new MarkerSaveError(response.status, null, `Marker load failed: ${response.status}`);
	}
	return body.data?.markers ?? [];
}
