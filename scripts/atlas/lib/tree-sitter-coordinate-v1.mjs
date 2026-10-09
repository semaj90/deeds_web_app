export function utf16OffsetToUtf8Byte(source, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) return null;
  if (offset > 0 && offset < source.length) {
    const before = source.charCodeAt(offset - 1);
    const after = source.charCodeAt(offset);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) return null;
  }
  return Buffer.byteLength(source.slice(0, offset), 'utf8');
}
