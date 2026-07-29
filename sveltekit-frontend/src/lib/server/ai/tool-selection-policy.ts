export type ToolDescriptor = {
  name: string;
  description: string;
  category: string;
  inputSchema: unknown;
};

export type ToolUsage = {
  name: string;
  lastUsedAt: number;
  callCount: number;
};

export type ToolSelectionInput = {
  query: string;
  turnNumber: number;
  tools: ToolDescriptor[];
  usage: ToolUsage[];
  requestedToolNames?: string[];
  requiredCategories?: string[];
  discoveryCallsInWindow: number;
  previousToolNames?: string[];
  subagentRole?: string;
  toolBudget?: number;
  rankedToolNames?: string[];
  alwaysIncludeToolNames?: string[];
  discoveredToolNames?: string[];
};

export type ToolSelectionResult = {
  selected: ToolDescriptor[];
  hiddenToolCount: number;
  reasonByTool: Record<string, string>;
  fallbackMode: 'NONE' | 'BOOTSTRAP_ALL' | 'DISCOVERY_FALLBACK_ALL' | 'REPLAY_COMPATIBILITY';
};

export const DEFAULT_ALWAYS_INCLUDE_TOOL_NAMES = [
  'tool_search',
  'read',
  'grep',
  'glob',
  'shell',
  'edit',
  'write',
  'task',
];

const TOOL_NAME_ALIASES: Record<string, string> = {
  tool_search: 'ops.search_tools',
};

const DEFAULT_TOOL_BUDGET = 24;
const MAX_RECENT_TOOLS = 50;
const MAX_DISCOVERY_CALLS_IN_WINDOW = 2;

function normalizeToolName(name: string): string {
  const normalized = String(name ?? '').trim();
  if (!normalized) return '';
  return TOOL_NAME_ALIASES[normalized] ?? normalized;
}

function uniqueOrdered(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const normalized = normalizeToolName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function normalizeUsage(usage: ToolUsage[], maxRecent = MAX_RECENT_TOOLS): ToolUsage[] {
  const latest = new Map<string, ToolUsage>();
  for (const entry of usage) {
    const normalized = normalizeToolName(entry.name);
    if (!normalized) continue;
    const current = latest.get(normalized);
    const next = {
      name: normalized,
      lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
      callCount: Number.isFinite(entry.callCount) ? Math.max(0, Math.trunc(entry.callCount)) : 0,
    };
    if (!current || next.lastUsedAt > current.lastUsedAt || (next.lastUsedAt === current.lastUsedAt && next.callCount > current.callCount)) {
      latest.set(normalized, next);
    }
  }

  return [...latest.values()]
    .sort((a, b) => {
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
      if (b.callCount !== a.callCount) return b.callCount - a.callCount;
      return a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(0, Math.trunc(maxRecent)));
}

function queryTokens(query: string): string[] {
  return uniqueOrdered(
    String(query ?? '')
      .toLowerCase()
      .split(/[^a-z0-9_]+/g)
      .filter((token) => token.length >= 2),
  );
}

function scoreTool(tool: ToolDescriptor, tokens: string[]): number {
  const haystackName = tool.name.toLowerCase();
  const haystackCategory = tool.category.toLowerCase();
  const haystackDescription = String(tool.description ?? '').toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (haystackName === token) score += 20;
    else if (haystackName.includes(token)) score += 12;

    if (haystackCategory === token) score += 8;
    else if (haystackCategory.includes(token)) score += 4;

    if (haystackDescription.includes(token)) score += 2;
  }

  if (haystackDescription.includes('search')) score += tokens.some((token) => token.includes('search')) ? 2 : 0;
  if (haystackDescription.includes('retrieve')) score += tokens.some((token) => token.includes('retriev')) ? 2 : 0;
  return score;
}

export function rankToolsByQuery(query: string, tools: ToolDescriptor[], limit = tools.length): ToolDescriptor[] {
  const tokens = queryTokens(query);
  return [...tools]
    .map((tool) => ({ tool, score: scoreTool(tool, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.tool.name !== b.tool.name) return a.tool.name.localeCompare(b.tool.name);
      return a.tool.category.localeCompare(b.tool.category);
    })
    .slice(0, Math.max(0, Math.trunc(limit)))
    .map(({ tool }) => tool);
}

function toolMap(tools: ToolDescriptor[]): Map<string, ToolDescriptor> {
  return new Map(tools.map((tool) => [normalizeToolName(tool.name), tool] as const));
}

function selectByNames(
  selectedNames: string[],
  catalog: Map<string, ToolDescriptor>,
  selected: ToolDescriptor[],
  reasons: Record<string, string>,
  reason: string,
  budget: number,
): number {
  let remaining = budget;
  if (remaining <= 0) return 0;
  for (const name of selectedNames) {
    if (remaining <= 0) break;
    const normalized = normalizeToolName(name);
    if (!normalized || selected.some((tool) => tool.name === normalized)) continue;
    const descriptor = catalog.get(normalized);
    if (!descriptor) continue;
    selected.push(descriptor);
    reasons[descriptor.name] = reason;
    remaining -= 1;
  }
  return remaining;
}

export function selectToolDescriptors(input: ToolSelectionInput): ToolSelectionResult {
  const budget = Math.max(1, Math.trunc(input.toolBudget ?? DEFAULT_TOOL_BUDGET));
  const catalog = toolMap(input.tools);
  const selected: ToolDescriptor[] = [];
  const reasonByTool: Record<string, string> = {};

  const alwaysInclude = uniqueOrdered([
    ...(input.alwaysIncludeToolNames ?? DEFAULT_ALWAYS_INCLUDE_TOOL_NAMES),
  ]);
  const explicitRequested = uniqueOrdered(input.requestedToolNames ?? []);
  const replayTools = uniqueOrdered(input.previousToolNames ?? []);
  const roleRequired = uniqueOrdered(input.requiredCategories ?? []).flatMap((category) =>
    input.tools.filter((tool) => tool.category === category).map((tool) => tool.name),
  );
  const discoveredTools = uniqueOrdered(input.discoveredToolNames ?? []);
  const recentTools = normalizeUsage(input.usage).map((usage) => usage.name);
  const rankedTools = uniqueOrdered(input.rankedToolNames ?? rankToolsByQuery(input.query, input.tools, budget * 2).map((tool) => tool.name));

  let fallbackMode: ToolSelectionResult['fallbackMode'] = 'NONE';
  let remaining = budget;

  if (input.turnNumber <= 3 && input.tools.length > budget) {
    fallbackMode = 'BOOTSTRAP_ALL';
  } else if (input.discoveryCallsInWindow >= MAX_DISCOVERY_CALLS_IN_WINDOW) {
    fallbackMode = 'DISCOVERY_FALLBACK_ALL';
  } else if (replayTools.length > 0) {
    fallbackMode = 'REPLAY_COMPATIBILITY';
  }

  remaining = selectByNames(replayTools, catalog, selected, reasonByTool, 'replay_compatibility', remaining);
  remaining = selectByNames(explicitRequested, catalog, selected, reasonByTool, 'explicit_request', remaining);
  remaining = selectByNames(alwaysInclude, catalog, selected, reasonByTool, 'always_include', remaining);
  remaining = selectByNames(roleRequired, catalog, selected, reasonByTool, 'role_required', remaining);
  remaining = selectByNames(discoveredTools, catalog, selected, reasonByTool, 'discovered', remaining);
  remaining = selectByNames(recentTools, catalog, selected, reasonByTool, 'recent_usage', remaining);
  remaining = selectByNames(rankedTools, catalog, selected, reasonByTool, 'query_ranked', remaining);

  if (remaining > 0) {
    for (const tool of input.tools) {
      if (selected.some((entry) => entry.name === tool.name)) continue;
      selected.push(tool);
      reasonByTool[tool.name] = 'budget_fill';
      remaining -= 1;
      if (remaining <= 0) break;
    }
  }

  return {
    selected,
    hiddenToolCount: Math.max(0, input.tools.length - selected.length),
    reasonByTool,
    fallbackMode,
  };
}

export function normalizeRecentToolUsage(usage: ToolUsage[], maxRecent = MAX_RECENT_TOOLS): ToolUsage[] {
  return normalizeUsage(usage, maxRecent);
}
