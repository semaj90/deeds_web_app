export function qualifyGraphifyCallerSymbolV1({ symbol, workspaceRevision, sourceRevision }) {
  const metadata = typeof symbol?.metadata === 'string'
    ? (() => {
      try {
        return JSON.parse(symbol.metadata);
      } catch {
        return {};
      }
    })()
    : symbol?.metadata;
  const reasons = [];

  if (metadata?.source_revision !== sourceRevision) reasons.push('SOURCE_REVISION_MISMATCH');
  if (metadata?.workspace_revision !== workspaceRevision) reasons.push('WORKSPACE_REVISION_MISMATCH');

  return {
    qualified: reasons.length === 0 && typeof symbol?.symbol_id === 'string' && symbol.symbol_id.length > 0,
    reasons: reasons.length === 0 && (!symbol?.symbol_id || typeof symbol.symbol_id !== 'string')
      ? ['SYMBOL_ID_MISSING']
      : reasons,
  };
}
