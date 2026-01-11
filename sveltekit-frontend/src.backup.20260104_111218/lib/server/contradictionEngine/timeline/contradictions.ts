import type { TimelineContradiction } from '../types.js';

export function describeTimelineContradictions(contradictions: TimelineContradiction[]): string[] {
 return contradictions.map((entry) => {
 const { first, second } = entry;
 switch (entry.type) {
 case 'impossible-presence':
 return `Actor ${first.actor ?? 'unknown'} cannot be in different locations simultaneously (${first.normalizedTime} vs ${second.normalizedTime}).`;
 case 'order-violation':
 return `Event order contradicts: "${first.claim}" vs "${second.claim}".`;
 case 'alibi-failure':
 return `Alibi contradiction for ${first.actor ?? 'unknown'} between "${first.claim}" and "${second.claim}".`;
 case 'duration-contradiction':
 return `Duration issue between "${first.claim}" and "${second.claim}".`;
 default:
 return 'Unknown timeline contradiction.';
 }
 });
}
