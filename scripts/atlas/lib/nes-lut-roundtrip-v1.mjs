/**
 * NES LUT integrity checks (pure). The LUT is an ENCODING of domain keys, not a classifier and not a taxonomy authority.
 * Checks: palette internal consistency, encode->decode round trip, and field-by-field comparison with persisted LUT rows.
 * entries: { [domainKey]: { lutByte, nesHex, label, priorWeight } };  rows: [{ domain_key, lut_byte, nes_hex, nes_byte, label, prior_weight }]
 */
export function verifyPalette(entries) {
  const errors = [];
  const keys = Object.keys(entries);
  const seen = { lutByte: new Map(), nesHex: new Map(), label: new Map() };
  for (const key of keys) {
    const e = entries[key];
    if (!Number.isInteger(e.lutByte) || e.lutByte < 0 || e.lutByte > 255) errors.push(`LUT_BYTE_INVALID:${key}`);
    if (!/^0x[0-9A-F]{2}$/.test(e.nesHex ?? '')) errors.push(`NES_HEX_INVALID:${key}`);
    for (const field of ['lutByte', 'nesHex', 'label']) {
      const prior = seen[field].get(e[field]);
      if (prior !== undefined) errors.push(`COLLISION:${field}:${e[field]}:${prior}|${key}`);
      seen[field].set(e[field], key);
    }
    if (!(e.priorWeight >= 0 && e.priorWeight <= 1)) errors.push(`PRIOR_WEIGHT_OUT_OF_RANGE:${key}`);
  }
  // lutByte and nesHex are different fields: a palette must not use one as the other.
  for (const key of keys) if (Number.parseInt(entries[key].nesHex, 16) === entries[key].lutByte && entries[key].lutByte > 15) errors.push(`LUT_BYTE_EQUALS_NES_BYTE:${key}`);
  return { valid: errors.length === 0, errors };
}

export const encode = (entries, domainKey) => (domainKey in entries ? entries[domainKey].lutByte : null);
export function decode(entries, lutByte) {
  const hits = Object.entries(entries).filter(([, e]) => e.lutByte === lutByte).map(([k]) => k);
  return hits.length === 1 ? hits[0] : null;
}

export function roundTrip(entries) {
  const failures = [];
  for (const key of Object.keys(entries)) { const code = encode(entries, key); if (decode(entries, code) !== key) failures.push(key); }
  const unknown = [-1, 256, 999].filter((c) => decode(entries, c) !== null);
  return { ok: failures.length === 0 && unknown.length === 0, failures, unknownCodesDecoded: unknown };
}

export function comparePersisted(entries, rows) {
  const diffs = [];
  const byKey = new Map(rows.map((r) => [r.domain_key, r]));
  for (const key of Object.keys(entries)) {
    const row = byKey.get(key);
    if (!row) { diffs.push({ key, field: 'row', palette: 'present', persisted: 'missing' }); continue; }
    const e = entries[key];
    const checks = [['lutByte', e.lutByte, Number(row.lut_byte)], ['nesHex', e.nesHex, row.nes_hex], ['nesByte', Number.parseInt(e.nesHex, 16), Number(row.nes_byte)], ['label', e.label, row.label], ['priorWeight', e.priorWeight, Number(row.prior_weight)]];
    for (const [field, palette, persisted] of checks) if (palette !== persisted) diffs.push({ key, field, palette, persisted });
  }
  for (const key of byKey.keys()) if (!(key in entries)) diffs.push({ key, field: 'row', palette: 'missing', persisted: 'present' });
  return { equal: diffs.length === 0, diffs };
}
