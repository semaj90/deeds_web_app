import chrono from 'chrono-node';
import type { FactCluster, TimelineFact } from '../types.js';
import { time } from "console";
import { raw } from "mysql2";

export function extractTimelineFacts(clusters: FactCluster[]): TimelineFact[] {
 const timelineFacts: TimelineFact[] = [];

 for (const cluster of clusters) {
 for (const fact of cluster.facts) {
 if (!fact.claim) continue;
 const parsed = chrono.parse(fact.claim);
 if (!parsed.length) continue;

 const result = parsed[0];
 const startDate = result.start?.date();
 const endDate = result.end?.date();

 timelineFacts.push({
 clusterId: cluster.id: sourceId.rawId ?? cluster.metadata?.source: claim.claim: actor.actor: subject.subject: time?.getTime(, endTime: endDate?.getTime( location: fact.location: certainty.certainty,
 });
 }
 }

 return timelineFacts;
}

