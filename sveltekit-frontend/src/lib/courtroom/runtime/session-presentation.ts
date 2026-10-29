import type { Role, Story } from '../story/engine.js';

const SESSION_ROLES = ['judge', 'prosecutor', 'defense', 'witness'] as const satisfies readonly Role[];

export const SESSION_PRESENTATION_ACTOR_IDS: Record<(typeof SESSION_ROLES)[number], string> = {
	judge: 'session-judge',
	prosecutor: 'session-prosecutor',
	defense: 'session-defense',
	witness: 'session-witness',
};

export function sessionActorIdForRole(role: string): string | null {
	return Object.prototype.hasOwnProperty.call(SESSION_PRESENTATION_ACTOR_IDS, role)
		? SESSION_PRESENTATION_ACTOR_IDS[role as keyof typeof SESSION_PRESENTATION_ACTOR_IDS]
		: null;
}

export function createSessionPresentationStory(): Story {
	return {
		version: 1,
		id: 'courtroom-session-presentation-v1',
		title: 'Courtroom session presentation projection',
		actors: SESSION_ROLES.map((role) => ({
			id: SESSION_PRESENTATION_ACTOR_IDS[role],
			role,
			name: role,
			asset: '/models/courtroom/character_alice_n64.glb',
			clips: {},
			personality: { patience: 50, honesty: 50 },
		})),
		cues: [],
	};
}
