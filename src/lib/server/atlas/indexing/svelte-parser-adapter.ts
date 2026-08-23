export type ParsedSvelteSymbol = {
  source_ref: string;
  symbol: string;
  kind: 'component' | 'script' | 'store' | 'action' | 'unknown';
};

export function parseSvelteSymbols(sourceRef: string, text: string): ParsedSvelteSymbol[] {
  const symbols: ParsedSvelteSymbol[] = [];
  const scriptMatches = text.matchAll(/<script\b[\s\S]*?<\/script>/gi);
  let hasScript = false;
  for (const match of scriptMatches) {
    hasScript = true;
    symbols.push({ source_ref: sourceRef, symbol: 'script', kind: 'script' });
  }
  if (/export\s+let\s+\w+/.test(text) || /<svelte:/.test(text)) {
    symbols.push({ source_ref: sourceRef, symbol: 'component', kind: 'component' });
  }
  if (!hasScript && symbols.length === 0) {
    symbols.push({ source_ref: sourceRef, symbol: 'unknown', kind: 'unknown' });
  }
  return symbols;
}

