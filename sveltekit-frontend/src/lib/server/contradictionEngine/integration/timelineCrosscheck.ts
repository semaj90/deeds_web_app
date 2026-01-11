import type { FactCluster, FactContradiction } from '../types.js';

export function timelineCrosscheck(clusters: FactCluster[]): FactContradiction[] {
 const contradictions: FactContradiction[] = [];

 for (let i = 0; i < clusters.length; i++) {
 for (let j = i + 1; j < clusters.length; j++) {
 for (const first of clusters[i].facts) {
 for (const second of clusters[j].facts) {
 if (
 first.time &&
 second.time &&
 first.time === second.time &&
 first.claim !== second.claim
 ) {
 contradictions.push({
 first,
 second,
 context: 'Timeline inconsistency',
 });
 }
 }
 }
 }
 }

 return contradictions;
}

