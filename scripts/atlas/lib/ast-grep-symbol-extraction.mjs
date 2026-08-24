/**
 * ast-grep-symbol-extraction.mjs
 *
 * NE-06 (openspec/changes/parent-atlas-neural-prefill-encoder): replace
 * regex-only symbol extraction in the active backfill
 * (`phase1-ast-grep-extraction.mjs`'s `extractSymbolsViaRegex`) with real
 * ast-grep structural extraction where the source language is supported.
 *
 * Scoped to TypeScript/JavaScript only. The `ast-grep` CLI installed in this
 * environment (0.42.3) has no `outline` subcommand, so this uses
 * `ast-grep run --pattern ... --stdin --json=compact` (one child process per
 * pattern, content piped via stdin — no temp files, no filesystem writes).
 * Python/Go remain on the existing regex fallback, clearly labeled as such
 * by the caller; this module does not claim to cover them.
 */

import { spawnSync } from 'node:child_process';

const TS_JS_PATTERNS = [
  { kind: 'FUNCTION', pattern: 'function $NAME($$$ARGS) { $$$ }' },
  { kind: 'FUNCTION', pattern: 'const $NAME = ($$$ARGS) => $$$BODY' },
  // Typed const declarations (`export const load: PageServerLoad = async (...) => {...}`,
  // `export const POST: RequestHandler = ...`) are the dominant SvelteKit route-handler
  // shape in this repo and were completely missed without this pattern — confirmed live
  // against real route files, where the untyped pattern above alone found 0 of the 3
  // exported handlers a manual comparison against the existing regex extractor found.
  { kind: 'FUNCTION', pattern: 'const $NAME: $TYPE = $$$BODY' },
  { kind: 'CLASS', pattern: 'class $NAME { $$$ }' },
  { kind: 'INTERFACE', pattern: 'interface $NAME { $$$ }' },
  { kind: 'TYPE', pattern: 'type $NAME = $$$BODY' },
  { kind: 'IMPORT', pattern: 'import $CLAUSE from $SRC' },
];

let astGrepAvailable = null;

function checkAstGrepAvailable() {
  if (astGrepAvailable !== null) return astGrepAvailable;
  const probe = spawnSync('ast-grep', ['--version'], { encoding: 'utf8', shell: true });
  astGrepAvailable = probe.status === 0;
  return astGrepAvailable;
}

function runPattern(content, lang, pattern) {
  // Node's `shell: true` on Windows joins `command`+`args` with plain spaces
  // (no per-arg quoting) before handing the string to cmd.exe, which then
  // treats bare `(`/`)`/spaces inside `--pattern`'s value as its own token
  // boundaries — this silently truncated the pattern (`function $NAME(...)`
  // became just `function`) when passed as a Node args array. Building one
  // pre-quoted command string ourselves is the only combination that
  // preserved the full pattern intact end to end (verified live). All
  // patterns here are static string literals with no embedded `"`.
  if (pattern.includes('"')) throw new Error('ast-grep pattern must not contain a double quote');
  const cmd = `ast-grep run --pattern "${pattern}" --lang ${lang} --stdin --json=compact`;
  const result = spawnSync(cmd, {
    input: content, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true,
  });
  if (result.status !== 0 || !result.stdout) return [];
  try {
    return JSON.parse(result.stdout);
  } catch {
    return [];
  }
}

/**
 * Real ast-grep structural extraction for TypeScript/JavaScript.
 * Returns null (not an empty result) when the language isn't TS/JS or the
 * `ast-grep` binary isn't on PATH, so callers can distinguish "ran and found
 * nothing" from "didn't run" and fall back to the regex extractor honestly.
 */
export function extractSymbolsViaAstGrep(content, language) {
  const lang = language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : null;
  if (!lang) return null;
  if (!checkAstGrepAvailable()) return null;

  const symbols = new Set();
  for (const { kind, pattern } of TS_JS_PATTERNS) {
    let matches;
    try {
      matches = runPattern(content, lang, pattern);
    } catch {
      continue;
    }
    for (const match of matches) {
      if (kind === 'IMPORT') {
        const src = match.metaVariables?.single?.SRC?.text;
        if (src) symbols.add(`import:${src.replace(/^['"]|['"]$/g, '')}`);
        continue;
      }
      const name = match.metaVariables?.single?.NAME?.text;
      if (name) symbols.add(name);
    }
  }

  return {
    symbols: [...symbols].sort(),
    coverage: symbols.size > 0 ? 1.0 : 0,
    method: 'ast_grep',
    error: null,
  };
}

/** For callers that need to report why ast-grep wasn't used without re-probing. */
export function isAstGrepAvailable() {
  return checkAstGrepAvailable();
}
