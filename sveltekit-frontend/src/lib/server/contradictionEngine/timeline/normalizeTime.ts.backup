import type { TimelineFact } from '../types.js';

export function normalizeTimelineFact(fact: TimelineFact): TimelineFact {
	return {
		...fact,
		// Assuming fact.time is a number (timestamp) or Date string.
        // TimelineFact definition in previous files indicated `number` for time/endTime.
		time: fact.time,
		endTime: fact.endTime,
	};
}

export function normalizeTimelineFacts(facts: TimelineFact[]): TimelineFact[] {
	return facts.map(normalizeTimelineFact);
}
