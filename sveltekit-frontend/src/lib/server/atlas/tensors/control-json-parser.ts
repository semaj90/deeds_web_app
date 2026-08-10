export type NativeJsonParse = (text: string) => unknown;

export function parseControlJson(text: string, nativeParse?: NativeJsonParse): unknown {
  if (!nativeParse) return JSON.parse(text);
  const parsed = nativeParse(text);
  // Protect against the known native-addon failure mode where a parser returns
  // the original JSON string instead of a parsed value.
  if (typeof parsed === 'string' && parsed.trim() === text.trim()) return JSON.parse(text);
  return parsed;
}
