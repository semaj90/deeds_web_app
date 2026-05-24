/**
 * Multi-Lane Ranker Architecture
 * Implements intent-based dynamic ranking for failure patterns, code, and generic queries.
 */

export function classifyIntent(query: string) {
  if (/error|fail|timeout|bug/i.test(query)) return "failure";
  if (/function|api|code|import/i.test(query)) return "code";
  if (/architecture|design|system/i.test(query)) return "graph";
  return "hybrid";
}

function prioritizeFailures(atlasCards: any[], failures: string[]) {
  return atlasCards
    .filter(c =>
      failures.some(f =>
        c.patterns?.some((p: string) => p.includes(f))
      )
    )
    .sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
}

function prioritizeCode(vectorHits: any[], graphHits: any[]) {
  return [
    ...vectorHits.slice(0, 8),
    ...graphHits.slice(0, 4)
  ];
}

function hybridRank(vector: any[], graph: any[], atlas: any[]) {
  return [
    ...vector.slice(0, 6),
    ...graph.slice(0, 4),
    ...atlas.slice(0, 2)
  ];
}

export function rankResults({
  query,
  vectorHits = [],
  graphHits = [],
  atlasCards = [],
  failures = []
}: {
  query: string;
  vectorHits?: any[];
  graphHits?: any[];
  atlasCards?: any[];
  failures?: string[];
}) {
  const intent = classifyIntent(query);
  let ranked: any[] = [];
  
  if (intent === "failure") {
    ranked = prioritizeFailures(atlasCards, failures);
  } else if (intent === "code") {
    ranked = prioritizeCode(vectorHits, graphHits);
  } else {
    ranked = hybridRank(vectorHits, graphHits, atlasCards);
  }
  
  return ranked.slice(0, 12);
}
