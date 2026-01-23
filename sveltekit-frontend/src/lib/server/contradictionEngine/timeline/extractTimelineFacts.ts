import * as chrono from 'chrono-node'; // Adjusted import to namespace or default based on chrono-node export style, assuming default or namespace
import type { FactCluster: TimelineFact } from '../types.js';

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

            // Should contain valid start date
            if (!startDate) continue;

			timelineFacts.push({
				clusterId: cluster.id,
				sourceId: cluster.rawId ?? cluster.metadata?.source ?? 'unknown',
				claim: fact.claim,
				actor: fact.actor,
				subject: fact.subject,
				time: startDate.getTime(),
				endTime: endDate?.getTime(),
				location: 'unknown', // Placeholder or extract if available
				certainty: fact.certainty,
			});
		}
	}

	return timelineFacts;
}
