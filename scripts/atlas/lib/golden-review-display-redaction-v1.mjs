const SECRET_ASSIGNMENT = /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|database[_-]?url|authorization)\b(\s*[=:]\s*)([^\s,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/g;
const OPENAI_STYLE_KEY = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const URL_USERINFO = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactGoldenReviewDisplayTextV1(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
    .replace(URL_USERINFO, '$1[REDACTED]@')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(AWS_ACCESS_KEY, '[REDACTED_AWS_KEY]')
    .replace(OPENAI_STYLE_KEY, '[REDACTED_API_KEY]')
    .replace(SECRET_ASSIGNMENT, '$1$2[REDACTED]');
}
