/**
 * Glyph mapping registry for mapping domain classes, topology labels,
 * and ontology labels to UnoCSS icon class tokens (Lucide icons).
 */

export const DOMAIN_GLYPHS: Record<string, string> = {
  codebase: 'i-lucide-code',
  retrieval: 'i-lucide-database-search',
  graph: 'i-lucide-network',
  agent: 'i-lucide-bot',
  utility: 'i-lucide-wrench',
  general: 'i-lucide-box',
  admin_observability: 'i-lucide-shield-alert',
};

export const TOPOLOGY_GLYPHS: Record<string, string> = {
  node: 'i-lucide-git-commit',
  edge: 'i-lucide-git-branch',
  cluster: 'i-lucide-hexagon',
  som: 'i-lucide-grid',
};

export const ONTOLOGY_GLYPHS: Record<string, string> = {
  general: 'i-lucide-box',
  facts: 'i-lucide-file-text',
  legal_authority: 'i-lucide-scale',
  claims: 'i-lucide-alert-triangle',
  parties: 'i-lucide-users',
  jurisdiction: 'i-lucide-map-pin',
};

/**
 * Get the UnoCSS icon class for a given value and type, with fallbacks.
 */
export function getGlyphIcon(value: string | null | undefined, type: 'domain' | 'topology' | 'ontology' = 'domain'): string {
  const val = String(value ?? '').toLowerCase().trim();
  
  if (type === 'topology') {
    return TOPOLOGY_GLYPHS[val] ?? 'i-lucide-circle';
  } else if (type === 'ontology') {
    return ONTOLOGY_GLYPHS[val] ?? 'i-lucide-tag';
  } else {
    return DOMAIN_GLYPHS[val] ?? 'i-lucide-help-circle';
  }
}
