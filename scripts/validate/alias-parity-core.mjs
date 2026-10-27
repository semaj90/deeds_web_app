/**
 * Pure, read-only parity between legacy atlas_packet_identity_aliases rows and proposed registry-v1 alias rows.
 * Typed verdicts only; nothing here decides, writes or falls back. Inputs are plain row arrays.
 * legacy:   { alias_key, canonical_packet_key, alias_kind }
 * proposed: { alias_key, canonical_packet_key, alias_kind }
 */
export const PARITY_VERDICTS = Object.freeze([
  'EXACT_MATCH',
  'LEGACY_ONLY',
  'PROPOSED_ONLY',
  'CANONICAL_KEY_CONFLICT',
  'ALIAS_KIND_CONFLICT',
  'LEGACY_DUPLICATE_ALIAS_KEY',
  'PROPOSED_DUPLICATE_ALIAS_KEY',
]);

const group = (rows) => {
  const map = new Map();
  for (const row of rows) map.set(row.alias_key, [...(map.get(row.alias_key) ?? []), row]);
  return map;
};

export function compareAliasMappings({ legacy, proposed }) {
  const left = group(legacy);
  const right = group(proposed);
  const results = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const l = left.get(key) ?? [];
    const r = right.get(key) ?? [];
    if (l.length > 1) { results.push({ alias_key: key, verdict: 'LEGACY_DUPLICATE_ALIAS_KEY' }); continue; }
    if (r.length > 1) { results.push({ alias_key: key, verdict: 'PROPOSED_DUPLICATE_ALIAS_KEY' }); continue; }
    if (l.length === 1 && r.length === 0) { results.push({ alias_key: key, verdict: 'LEGACY_ONLY', canonical: l[0].canonical_packet_key }); continue; }
    if (l.length === 0 && r.length === 1) { results.push({ alias_key: key, verdict: 'PROPOSED_ONLY', canonical: r[0].canonical_packet_key }); continue; }
    if (l[0].canonical_packet_key !== r[0].canonical_packet_key) results.push({ alias_key: key, verdict: 'CANONICAL_KEY_CONFLICT', legacy: l[0].canonical_packet_key, proposed: r[0].canonical_packet_key });
    else if (l[0].alias_kind !== r[0].alias_kind) results.push({ alias_key: key, verdict: 'ALIAS_KIND_CONFLICT', legacy: l[0].alias_kind, proposed: r[0].alias_kind });
    else results.push({ alias_key: key, verdict: 'EXACT_MATCH' });
  }
  const counts = Object.fromEntries(PARITY_VERDICTS.map((v) => [v, 0]));
  for (const row of results) counts[row.verdict] += 1;
  // Parity only holds when nothing conflicts or duplicates; LEGACY_ONLY / PROPOSED_ONLY are coverage gaps, reported separately.
  const blocking = counts.CANONICAL_KEY_CONFLICT + counts.ALIAS_KIND_CONFLICT + counts.LEGACY_DUPLICATE_ALIAS_KEY + counts.PROPOSED_DUPLICATE_ALIAS_KEY;
  return { counts, results, conflictFree: blocking === 0, coverageComplete: counts.LEGACY_ONLY === 0 && counts.PROPOSED_ONLY === 0 };
}
