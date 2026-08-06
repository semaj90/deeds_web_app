export const DEFAULT_PATTERN_RULES = Object.freeze([
  { code: 'TODO', severity: 'medium', pattern: /\bTODO\b[:\s-]*(.*)$/gim },
  { code: 'FIXME', severity: 'high', pattern: /\bFIXME\b[:\s-]*(.*)$/gim },
  { code: 'HACK', severity: 'medium', pattern: /\bHACK\b[:\s-]*(.*)$/gim },
  { code: 'PLACEHOLDER', severity: 'high', pattern: /\bplaceholder\b[:\s-]*(.*)$/gim },
  { code: 'NOT_IMPLEMENTED', severity: 'high', pattern: /\bnot implemented\b|throw new Error\(["']not implemented/i },
  { code: 'RETURN_TRUE_STUB', severity: 'high', pattern: /\breturn\s+true\s*;?\s*(?:\/\/.*)?$/gim },
  { code: 'FIXED_CONFIDENCE', severity: 'high', pattern: /(?:confidence|score)\s*[:=]\s*0\.\d+\s*(?:[,;]|$)/gim },
  { code: 'UNKNOWN_ID', severity: 'high', pattern: /\bUNKNOWN_ID\b/g },
  { code: 'DERIVED_CONTEXT_STUB', severity: 'high', pattern: /\bderived_from_context\b/g },
  { code: 'TRUNCATED_SUMMARY_LABEL', severity: 'high', pattern: /substring\s*\(\s*0\s*,[^)]*(?:30|Math\.min)/gim },
  { code: 'CANONICAL_MUTATION_TRUE', severity: 'critical', pattern: /canonicalMutation\s*:\s*true/gim },
  { code: 'NUMERIC_STATUS', severity: 'medium', pattern: /featureLabelStatus\s*:\s*\d+/gim },
]);

export function scanPlaceholderPatterns(text, rules = DEFAULT_PATTERN_RULES) {
  if (typeof text !== 'string' || !text) return [];
  const findings = [];
  for (const rule of rules) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      findings.push({
        code: rule.code,
        severity: rule.severity,
        line: text.slice(0, match.index).split(/\r?\n/).length,
        match: match[0].slice(0, 240),
      });
      if (!regex.global) break;
    }
  }
  return findings;
}
