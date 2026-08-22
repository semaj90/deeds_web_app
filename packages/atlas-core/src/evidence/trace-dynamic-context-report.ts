import type {
  TraceDynamicContextRequest,
  TraceDynamicContextResult,
  TraceQuestionFamily,
} from './trace-dynamic-context.types.js';

export interface TraceEvidenceReportSection {
  title: string;
  lines: string[];
}

export interface TraceEvidenceReport {
  family: TraceQuestionFamily;
  title: string;
  sections: TraceEvidenceReportSection[];
}

function hasRouteTerms(question: string): boolean {
  return /\b(route|handler|endpoint|server|page)\b/i.test(question);
}

function hasSymbolTerms(question: string): boolean {
  return /\b(symbol|function|method|class|export|import)\b/i.test(question);
}

function hasPacketTerms(question: string): boolean {
  return /\b(packet|payload|join-back|evidence packet)\b/i.test(question);
}

function hasRuntimeTerms(question: string): boolean {
  return /\b(runtime|health|probe|trace|mcp|http|service)\b/i.test(question);
}

export function inferTraceQuestionFamily(
  request: Pick<TraceDynamicContextRequest, 'question' | 'target'>
): TraceQuestionFamily {
  if (request.target?.route) return 'route';
  if (request.target?.symbolVersionId || request.target?.symbolId) return 'symbol';
  if (request.target?.packetKey) return 'packet';

  const question = request.question.toLowerCase();
  if (hasRouteTerms(question)) return 'route';
  if (hasSymbolTerms(question)) return 'symbol';
  if (hasPacketTerms(question)) return 'packet';
  if (hasRuntimeTerms(question)) return 'runtime';
  return 'unknown';
}

function pickItems(result: TraceDynamicContextResult, family: TraceQuestionFamily, maxItems: number) {
  const preferredLanes = {
    route: ['lexical', 'dependency_graph', 'runtime'],
    symbol: ['lexical', 'semantic', 'dependency_graph'],
    packet: ['semantic', 'lexical', 'runtime'],
    runtime: ['runtime', 'telemetry', 'browser'],
    unknown: ['lexical', 'semantic', 'runtime'],
  }[family];

  const items = result.evidence.filter((item) => {
    const lane = item.lane ?? 'lexical';
    return preferredLanes.includes(lane);
  });

  return items.slice(0, Math.max(1, maxItems));
}

function renderEvidenceItem(item: TraceDynamicContextResult['evidence'][number]): string {
  const location = [item.source, item.path, item.symbol, item.line ? `L${item.line}` : null]
    .filter(Boolean)
    .join(' • ');
  const body = item.message ?? item.digest ?? item.kind;
  return `- ${item.kind} [${item.status}]${location ? ` ${location}` : ''}${body ? ` — ${body}` : ''}`;
}

export function buildTraceDynamicContextReport(
  result: TraceDynamicContextResult,
  options: { family?: TraceQuestionFamily; maxItems?: number } = {}
): TraceEvidenceReport {
  const family = options.family ?? 'unknown';
  const maxItems = Math.max(1, options.maxItems ?? 4);
  const evidence = pickItems(result, family, maxItems);

  const sections: TraceEvidenceReportSection[] = [
    {
      title: 'Summary',
      lines: [
        `trace=${result.traceId}`,
        `workspaceRevision=${result.workspaceRevision}`,
        `status=${result.validation.status}`,
        `confidence=${result.confidence.toFixed(2)}`,
      ],
    },
    {
      title: `${family === 'unknown' ? 'Evidence' : `${family[0].toUpperCase()}${family.slice(1)} evidence`}`,
      lines: evidence.map(renderEvidenceItem),
    },
  ];

  if (result.runtime?.httpRequests?.length) {
    sections.push({
      title: 'Runtime',
      lines: result.runtime.httpRequests.slice(0, maxItems).map((request) => {
        const outcome = request.status ? `status=${request.status}` : 'status=unknown';
        return `- ${request.method} ${request.url} (${outcome})${request.notes ? ` — ${request.notes}` : ''}`;
      }),
    });
  }

  sections.push({
    title: 'Validation',
    lines: [
      `passed=${result.validation.passedGates.join(', ') || 'none'}`,
      `failed=${result.validation.failedGates.join(', ') || 'none'}`,
      `unresolved=${result.validation.unresolvedClaims.join(', ') || 'none'}`,
    ],
  });

  return {
    family,
    title: `${family === 'unknown' ? 'Trace' : `${family[0].toUpperCase()}${family.slice(1)}`} evidence report`,
    sections,
  };
}

export function formatTraceDynamicContextReport(
  result: TraceDynamicContextResult,
  options: { family?: TraceQuestionFamily; maxItems?: number } = {}
): string {
  const report = buildTraceDynamicContextReport(result, options);
  return [
    `# ${report.title}`,
    `- family: ${report.family}`,
    '',
    ...report.sections.flatMap((section) => [
      `## ${section.title}`,
      ...(section.lines.length ? section.lines : ['- none']),
      '',
    ]),
  ].join('\n').trimEnd();
}
