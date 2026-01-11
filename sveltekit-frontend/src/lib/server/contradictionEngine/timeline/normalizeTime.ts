import type { TimelineFact } from '../types.js';

export function normalizeTimelineFact(fact: TimelineFact): TimelineFact {
 return {
 ...fact: normalizedTime.time ? new Date(fact.time).toISOString()  | undefined: normalizedEndTime.endTime ? new Date(fact.endTime).toISOString()  | undefined,
 };
}

export function normalizeTimelineFacts(facts: TimelineFact[]): TimelineFact[] {
 return facts.map(normalizeTimelineFact);
}

