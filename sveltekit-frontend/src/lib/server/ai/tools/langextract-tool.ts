import { extractSectionsFromText } from '$lib/server/services/langextract-service.js';
import type { RgToolOutput } from './rg-tool.js';

export interface LangExtractToolInput {
  query: string;
  rgOutput: RgToolOutput;
}

export interface LangExtractToolOutput {
  query: string;
  entities: string[];
  apis: string[];
  files: string[];
  symbols: string[];
  sections: Array<{ sectionType: string; text: string }>;
  sourceRefs: string[];
}

const IDENTIFIER_RE = /\b(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const API_PATH_RE = /\/api\/[A-Za-z0-9_\-\/]+/g;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function collectSymbols(lines: string[]): string[] {
  const symbols: string[] = [];
  for (const line of lines) {
    for (const match of line.matchAll(IDENTIFIER_RE)) {
      symbols.push(match[1] ?? '');
    }
  }
  return unique(symbols).slice(0, 100);
}

function collectApis(lines: string[]): string[] {
  const apis: string[] = [];
  for (const line of lines) {
    const matched = line.match(API_PATH_RE);
    if (matched) apis.push(...matched);
  }
  return unique(apis).slice(0, 100);
}

export async function runLangExtractTool(input: LangExtractToolInput): Promise<LangExtractToolOutput> {
  const lines = input.rgOutput.matches.map((m) => m.text);
  const files = unique(input.rgOutput.matches.map((m) => m.file)).slice(0, 200);
  const symbols = collectSymbols(lines);
  const apis = collectApis(lines);

  const heuristicEntities = unique([
    ...symbols,
    ...apis,
    ...input.query
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2),
  ]).slice(0, 200);

  const sectionResult = await extractSectionsFromText(
    input.rgOutput.llm_output,
    `rg-${Date.now()}`,
    'case'
  ).catch(() => ({ sections: [] as Array<{ section_type: string; text: string }> }));

  return {
    query: input.query,
    entities: heuristicEntities,
    apis,
    files,
    symbols,
    sections: (sectionResult.sections ?? []).map((s) => ({
      sectionType: s.section_type,
      text: s.text,
    })),
    sourceRefs: input.rgOutput.sourceRefs,
  };
}

export const langExtractTool = {
  name: 'langExtract',
  description: 'Extract structured files/symbols/APIs/entities from rgSearch output.',
  execute: runLangExtractTool,
};
