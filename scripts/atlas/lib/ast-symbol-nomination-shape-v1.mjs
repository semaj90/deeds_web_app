const DECLARATION_NAME = /^[\p{L}_$][\p{L}\p{N}_$]*(?:(?:\.|::)[\p{L}_$][\p{L}\p{N}_$]*)*$/u;
const LANGUAGE = /^[a-z][a-z0-9_+-]{0,31}$/;

export function validateAstSymbolNominationShapeV1(candidate) {
  if (!candidate || typeof candidate !== 'object') return { valid: false, reason: 'CANDIDATE_NOT_OBJECT' };
  const name = String(candidate.symbol_name ?? candidate.name ?? '').normalize('NFC');
  if (!DECLARATION_NAME.test(name)) return { valid: false, reason: 'DECLARATION_NAME_INVALID' };
  const language = String(candidate.language ?? '').trim().toLowerCase();
  if (!LANGUAGE.test(language) || language === 'unknown') return { valid: false, reason: 'LANGUAGE_UNAVAILABLE' };
  const startByte = candidate.start_byte !== undefined ? candidate.start_byte : candidate.byte_start;
  const endByte = candidate.end_byte !== undefined ? candidate.end_byte : candidate.byte_end;
  if ((typeof startByte !== 'number' && typeof startByte !== 'string')
    || (typeof endByte !== 'number' && typeof endByte !== 'string')
    || String(startByte).trim() === '' || String(endByte).trim() === '') {
    return { valid: false, reason: 'BYTE_SPAN_INVALID' };
  }
  const start = Number(startByte);
  const end = Number(endByte);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
    return { valid: false, reason: 'BYTE_SPAN_INVALID' };
  }
  return { valid: true, name, language, startByte: start, endByte: end };
}
