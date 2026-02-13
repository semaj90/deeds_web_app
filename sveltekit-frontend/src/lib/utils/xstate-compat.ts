// Compatibility helpers for XState v4/v5 actor APIs
// Provides safe wrappers around actor.start/stop and a readActorSnapshot utility

// Narrow, generic shape for actors we interact with - avoids `any` and supports both v4/v5 shapes.
type ActorLike<S = unknown> = {
	getSnapshot?: () => S;
	getState?: () => S;
	state?: S;
	start?: () => void | (() => void);
	stop?: () => void;
};

export function readActorSnapshot<S = unknown>(actor: ActorLike<S> | undefined): S | undefined {
	try {
		if (!actor) return undefined;
		if (typeof actor.getSnapshot === 'function') return actor.getSnapshot();
		if (typeof actor.getState === 'function') return actor.getState();
		if ((actor as Record<string, unknown>).state !== undefined) {
			return (actor as Record<string, unknown>).state as S;
		}
		return undefined;
	} catch (err: unknown) {
		console.warn('readActorSnapshot failed', err);
		return undefined;
	}
}

export function safeStart(actor: ActorLike | undefined): void {
	try {
		if (!actor) return;
		if (typeof actor.start === 'function') {
			void actor.start();
		}
	} catch (err: unknown) {
		console.warn('safeStart failed', err);
	}
}

export function safeStop(actor: ActorLike | undefined): void {
	try {
		if (!actor) return;
		if (typeof actor.stop === 'function') actor.stop();
	} catch (err: unknown) {
		console.warn('safeStop failed', err);
	}
}

export default { readActorSnapshot, safeStart, safeStop };
