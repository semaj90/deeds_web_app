import type { FactCluster, FactContradiction } from '../types.js';

export function compareFacts(clusters: FactCluster[]): FactContradiction[] {
    const contradictions: FactContradiction[] = [];

    for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
            for (const first of clusters[i].facts) {
                for (const second of clusters[j].facts) {
                    const conflict =
                        first?.actor &&
                        second?.actor &&
                        first.actor === second.actor &&
                        first?.subject &&
                        second?.subject &&
                        first.subject === second.subject &&
                        first?.claim &&
                        second?.claim &&
                        first.claim !== second.claim;

                    if (conflict) {
                        contradictions.push({
                            first,
                            second,
                            context: `${clusters[i].metadata?.source ?? 'evidence'} vs ${clusters[j].metadata?.source ?? 'testimony'}`,
                        });
                    }
                }
            }
        }
    }

    return contradictions;
}
