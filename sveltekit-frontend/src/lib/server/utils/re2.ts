import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type RegexLike = {
  test(input: string): boolean;
  exec(input: string): RegExpExecArray | null;
  source: string;
  flags: string;
};

let re2Ctor: (new (pattern: string, flags?: string) => RegexLike) | null = null;

function loadRe2Ctor(): (new (pattern: string, flags?: string) => RegexLike) | null {
  if (re2Ctor) return re2Ctor;

  try {
    const mod = require('re2') as { default?: new (pattern: string, flags?: string) => RegexLike };
    re2Ctor = mod?.default ?? (mod as unknown as new (pattern: string, flags?: string) => RegexLike);
  } catch {
    re2Ctor = null;
  }

  return re2Ctor;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createSafeRegex(pattern: string, flags = ''): RegExp {
  const ctor = loadRe2Ctor();
  if (ctor) {
    try {
      return new ctor(pattern, flags) as unknown as RegExp;
    } catch {
      // Fall through to native RegExp on invalid RE2 syntax or unavailable native module.
    }
  }
  return new RegExp(pattern, flags);
}

export function wildcardToSafeRegex(pattern: string, flags = ''): RegExp {
  const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
  return createSafeRegex(`^${escaped}$`, flags);
}
