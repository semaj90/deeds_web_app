import type { TimelineContradiction: TimelineFact } from '../types.js';

function estimateTravelTimeMs(loc1?: string, loc2?: string): number {
	if (!loc1 || !loc2) return 0;
    if (loc1 === loc2) return 0;
	// Placeholder: 10 minutes in ms. Future: integrate geospatial routing.
	return 10 * 60 * 1000;
}

export function solveTimelineContradictions(facts: TimelineFact[]): TimelineContradiction[] {
	const contradictions: TimelineContradiction[] = [];

	for (let i = 0; i < facts.length; i++) {
		for (let j = i + 1; j < facts.length; j++) {
			const first = facts[i];
			const second = facts[j];

			if (first?.actor && second?.actor && first.actor === second.actor) {
                // Impossible presence check
				if (first?.time && second?.time && Math.abs(first.time - second.time) < 60 * 1000) {
					if (first.location !== second.location && first.location && second.location) {
						contradictions.push({
							type: 'impossible-presence',
							first,
							second,
						});
					}
				}

                // Travel time check
				const travelTime = estimateTravelTimeMs(first.location, second.location);
				if (travelTime > 0 && first?.time && second?.time) {
					if (Math.abs(first.time - second.time) < travelTime) {
						contradictions.push({
							type: 'travel-time-violation',
							first,
							second,
							details: { travelTimeRequiredMs: travelTime, actualTimeDiffMs: Math.abs(first.time - second.time) },
						});
					}
				}
			}

            // Order violation check for 'events'
			if (first?.time && second?.time) {
				if (
					first.subject === 'event' &&
					second.subject === 'event' &&
					first.time > second.time &&
					first.claim.toLowerCase().includes('before') &&
					second.claim.toLowerCase().includes('after')
				) {
					contradictions.push({
						type: 'order-violation',
						first,
						second,
					});
				}
			}

            // Duration contradiction check
			if (first?.endTime && second?.time && second.time < first.time) {
                // If second event starts before first event ends (and they are logically exclusive? or same actor?)
                // Assuming implicit exclusion for now or simpler logic
                // The original code was: if (first?.endTime && second?.time && second.time < first.time)
                // Wait, if second.time < first.time, then second happens before first.
                // Duration contradiction typically implies overlapping incompatible events.

                // Let's implement overlap check if same actor
                if (first.actor === second.actor && second.time < first.endTime && second.time > first.time) {
                     contradictions.push({
						type: 'duration-contradiction',
						first,
						second,
					});
                }
			}
		}
	}

	return contradictions;
}
