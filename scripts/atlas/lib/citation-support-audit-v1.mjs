/**
 * Conservative source audit for code identifiers named in a generated claim.
 * This checks lexical support only; it is not a semantic entailment checker.
 */
export function auditCitedIdentifiers(answer, sources) {
  const sourceById = new Map(sources.map(({ evidenceId, content }) => [evidenceId, String(content ?? '').toLowerCase()]));
  const unsupported = [];
  const sentences = String(answer ?? '').split(/(?<=[.!?])\s+|\n+/);

  for (const sentence of sentences) {
    const citedIds = [...new Set([...sentence.matchAll(/\b([ER]\d+)\b/g)].map((match) => match[1]))];
    const citedText = citedIds.map((id) => sourceById.get(id) ?? '').join('\n');
    for (const match of sentence.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)) {
      const identifier = match[1];
      // Avoid treating ordinary lower-case words as code symbols; require camelCase,
      // PascalCase, or an underscore so this stays a narrow, explainable check.
      if (!/[A-Z_]/.test(identifier.slice(1)) && !identifier.includes('_')) continue;
      if (!citedText.includes(identifier.toLowerCase())) {
        unsupported.push({ identifier, citedIds });
      }
    }
  }

  return unsupported;
}
