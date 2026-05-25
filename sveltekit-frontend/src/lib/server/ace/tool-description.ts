type ToolDescriptionRule = {
  regex: RegExp;
  description: string;
  priority: number;
};

const TOOL_DESCRIPTION_RULES: ToolDescriptionRule[] = [
  { regex: /\bgraph-export-recover\b/i, description: 'Recover graph export artifacts and validate recovery outputs', priority: 100 },
  { regex: /\brecover:graph\b/i, description: 'Recover graph export artifacts and validate recovery outputs', priority: 100 },
  { regex: /\bpatch-graph-export-roots\b/i, description: 'Patch graph export fallback root resolution', priority: 95 },
  { regex: /\bapply-opencode-patches\b/i, description: 'Merge OpenCode config patches into the active workspace config', priority: 94 },
  { regex: /\bsmoke-duckdb\b/i, description: 'Run DuckDB export contract smoke test', priority: 93 },
  { regex: /\bgraph:exports\b/i, description: 'Generate graph export artifacts', priority: 92 },
  { regex: /\brg\s+--files\s+-uu\b/i, description: 'Discover files including gitignored paths', priority: 90 },
  { regex: /\brg\s+-n\b/i, description: 'Search confirmed files for exact references', priority: 89 },
  { regex: /\b(fuse\.js|fuzzy|loose search)\b/i, description: 'Run fuzzy fallback search before semantic recall', priority: 88.5 },
  { regex: /\b(qdrant|turbovec)\b/i, description: 'Query the semantic vector index and payload tags', priority: 88 },
  { regex: /\b(redis|ace:packet|ace:stream|ace cache|prompt cache)\b/i, description: 'Read or write Redis ACE packet cache', priority: 87 },
  { regex: /\b(langextract|entities?)\b/i, description: 'Extract structured entities and feature hints', priority: 86 },
  { regex: /\b(did you mean|did-you-mean|suggestion builder)\b/i, description: 'Build candidate suggestions from semantic variance recovery', priority: 85.5 },
  { regex: /\b(clusterTags?|tag recall|semantic search)\b/i, description: 'Recall cluster tags and semantic search signals', priority: 85.25 },
  { regex: /\b(pagerank|webgpu|mapreduce)\b/i, description: 'Compute graph ranking or batch reduction hints', priority: 85 },
  { regex: /\bduckdb\b/i, description: 'Run DuckDB analytical smoke or reporting commands', priority: 84 },
  { regex: /\bneo4j\b/i, description: 'Write or validate Neo4j graph relationships', priority: 83 },
  { regex: /\bpostgres|pgvector\b/i, description: 'Validate Postgres retrieval and vector integrity', priority: 82 },
  { regex: /\bdocker\b/i, description: 'Run containerized service runtime commands', priority: 81 },
  { regex: /\bnpm\s+run\b/i, description: 'Run npm script', priority: 80 },
  { regex: /\bnode(?:\.exe)?\b/i, description: 'Run Node.js script', priority: 79 },
  { regex: /\bpowershell\b|\bpwsh\b/i, description: 'Run PowerShell command', priority: 78 }
];

function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim();
}

function scoreRule(command: string, rule: ToolDescriptionRule): number {
  const match = command.match(rule.regex);
  if (!match) return -1;

  const text = match[0].toLowerCase();
  let score = rule.priority + text.length * 0.01;

  if (/\bgraph-export-recover\b/i.test(command) || /\brecover:graph\b/i.test(command)) {
    score += 10;
  }

  if (/\bqdrant\b/i.test(command) && /\bredis\b/i.test(command)) {
    score += 2;
  }

  if (/\bfuzzy\b/i.test(command) && /\bqdrant\b/i.test(command)) {
    score += 1.5;
  }

  if (/\bwebgpu\b/i.test(command) && /\bpagerank\b/i.test(command)) {
    score += 2;
  }

  return score;
}

export function buildToolDescription(command: string): string {
  const normalized = normalizeCommand(command);
  const bestRule = TOOL_DESCRIPTION_RULES
    .map((rule) => ({ rule, score: scoreRule(normalized, rule) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score)[0];

  if (bestRule) return bestRule.rule.description;

  const compact = normalized.slice(0, 80);
  if (!compact) return 'Execute command safely';
  return `Execute command safely: ${compact}`;
}

export function withDescription(command: string) {
  return {
    description: buildToolDescription(command),
    command: normalizeCommand(command)
  };
}

export function getToolDescriptionRules() {
  return [...TOOL_DESCRIPTION_RULES];
}
