import type { SgNode } from '@ast-grep/napi';

export type VitestCaseLocatorInput = {
  title: string;
  line?: number | null;
};

export type VitestCaseLocation = {
  status: 'resolved' | 'ambiguous' | 'unresolved';
  candidates: Array<{
    callee: 'test' | 'it';
    title: string;
    byte_start: number;
    byte_end: number;
    line: number;
    column: number;
  }>;
};

function nodeRange(node: SgNode) {
  const r = node.range();
  return { byte_start: r.start.index, byte_end: r.end.index, line: r.start.line + 1, column: r.start.column + 1 };
}

function parseStaticTitle(text: string): { callee: 'test' | 'it'; title: string } | null {
  const match = text.match(/^\s*(test|it)(?:\.(?:skip|only|todo|fails|concurrent|each))?\s*\(\s*(['"`])([^'"`]+)\2/s);
  if (!match) return null;
  return { callee: match[1] as 'test' | 'it', title: match[3]!.trim() };
}

/**
 * Resolve the source span for one Vitest reporter nomination. The reporter owns
 * execution status; this locator only grounds that nominated test back to an
 * explicit static test()/it() declaration. Parameterized/dynamic titles that
 * cannot be statically recovered remain unresolved.
 */
export async function locateStaticVitestCase(code: string, input: VitestCaseLocatorInput): Promise<VitestCaseLocation> {
  const { parse } = await import('@ast-grep/napi');
  let root: ReturnType<typeof parse>;
  try { root = parse('TypeScript', code); } catch { try { root = parse('Tsx', code); } catch { return { status: 'unresolved', candidates: [] }; } }

  const title = input.title.normalize('NFC').trim();
  const candidates = [];
  for (const node of root.root().findAll({ rule: { kind: 'call_expression' } })) {
    const parsed = parseStaticTitle(node.text());
    if (!parsed || parsed.title.normalize('NFC').trim() !== title) continue;
    const range = nodeRange(node);
    // Prefer the reporter-provided line when available; tolerate a one-line
    // wrapper offset but never choose among multiple remaining candidates.
    if (input.line != null && Math.abs(range.line - input.line) > 1) continue;
    candidates.push({ ...parsed, ...range });
  }
  if (candidates.length === 1) return { status: 'resolved', candidates };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'unresolved', candidates: [] };
}
