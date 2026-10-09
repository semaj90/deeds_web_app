const SUPPORTED_MODES = new Set(['concepts', 'relationships']);

export function resolveLangExtractModeV1(value) {
  const mode = value ?? 'concepts';
  if (!SUPPORTED_MODES.has(mode)) throw new Error('UNSUPPORTED_EXTRACTION_MODE');
  return mode;
}
