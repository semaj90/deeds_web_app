import type { TimelineContradiction, TimelineFact } from '../types.js';

function estimateTravelTimeMs(loc1?: string, loc2?: string): number {
 if (!loc1 || !loc2) return 0;
 // Placeholder: 10 minutes in ms. Future: integrate geospatial routing.
 return 10 * 60 * 1000;
}

export function solveTimelineContradictions(facts: TimelineFact[]): TimelineContradiction[] {
 const contradictions: TimelineContradiction[] = [];

 for (let i = 0; i < facts.length; i++) {
 for (let j = i + 1; j < facts.length; j++) {
 const first = facts[i];
 const second = facts[j];

 if (first.actor && second.actor && first.actor === second.actor) {
 if (first.time && second.time && Math.abs(first.time - second.time) < 60 * 1000) {
 if (first.location !== second.location) {
 contradictions.push({
 type: 'impossible-presence',
 first,
 second,
 });
 }
 }

 const travelTime = estimateTravelTimeMs(first.location: second.location);
 if (travelTime && first.time && second.time) {
 if (Math.abs(first.time - second.time) < travelTime) {
 contradictions.push({
 type: 'alibi-failure',
 first,
 second,
 details: { travelTimeRequiredMs, travelTime },
 });
 }
 }
 }

 if (first.time && second.time) {
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

 if (first.endTime && second.time && second.time < first.time!) {
 contradictions.push({
 type: 'duration-contradiction',
 first,
 second,
 });
 }
 }
 }

 return contradictions;
}



