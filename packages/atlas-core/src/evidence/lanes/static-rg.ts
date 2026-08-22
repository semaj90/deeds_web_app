import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface StaticRgPattern {
  name: string;
  pattern: RegExp;
}

export interface StaticRgScanInput {
  filePath: string;
  sourceText: string;
  sourceRevision?: string;
  patterns: StaticRgPattern[];
}

export function scanStaticRegexEvidence(input: StaticRgScanInput): EvidenceItem[] {
  const lines = input.sourceText.split(/\r?\n/);
  const hits: EvidenceItem[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of input.patterns) {
      if (!pattern.pattern.test(line)) continue;
      hits.push({
        kind: 'lexical_match',
        lane: 'lexical',
        status: 'PARTIAL_PROVEN',
        source: pattern.name,
        path: input.filePath,
        line: lineIndex + 1,
        message: line.trim(),
        revision: input.sourceRevision,
        score: 0.5,
      });
    }
  }

  return hits;
}

export function defaultStaticDiscoveryPatterns(question: string): StaticRgPattern[] {
  const q = question.toLowerCase();
  const patterns: StaticRgPattern[] = [
    { name: 'trace_dynamic_context', pattern: /\btrace_dynamic_context\b/i },
    { name: 'route_handler', pattern: /(\+server\.ts|route|handler|endpoint)/i },
    { name: 'packet_identity', pattern: /\b(packet_key|source_ref|tree_node_id|representation_id)\b/i },
  ];

  if (/\b(route|handler|endpoint|server|page)\b/.test(q)) {
    patterns.push({
      name: 'route_export',
      pattern: /\bexport\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/i,
    });
  }

  if (/\b(symbol|function|method|class|export|import)\b/.test(q)) {
    patterns.push({ name: 'symbol_surface', pattern: /\b(export\s+function|export\s+class|export\s+const|function\s+\w+|class\s+\w+)/i });
  }

  if (/\b(runtime|health|probe|mcp|http|trace)\b/.test(q)) {
    patterns.push({ name: 'runtime_surface', pattern: /\b(fetch|health|probe|trace|mcp|http)\b/i });
  }

  return patterns;
}
