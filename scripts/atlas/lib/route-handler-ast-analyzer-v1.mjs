/**
 * route-handler-ast-analyzer-v1.mjs
 *
 * Granular SvelteKit route handler AST analyzer for Gate G5 (parsesBody & Zod validation).
 * Extracts per-handler method, body parser classification, Zod validation evidence,
 * and exact source spans.
 */

/**
 * Find matching closing brace in JavaScript/TypeScript code,
 * properly ignoring strings, template literals, and comments.
 *
 * @param {string} src
 * @param {number} openIndex - Index of the opening '{'
 * @returns {number} Index of matching '}', or -1 if unbalanced
 */
export function findMatchingBrace(src, openIndex) {
  if (src[openIndex] !== '{') return -1;

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];
    const prev = i > 0 ? src[i - 1] : '';
    const next = i + 1 < src.length ? src[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === '*' && ch === '/') inBlockComment = false;
      continue;
    }
    if (inSingleQuote) {
      if (ch === "'" && prev !== '\\') inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"' && prev !== '\\') inDoubleQuote = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '`' && prev !== '\\') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

/**
 * Classify body parser type in handler source snippet.
 *
 * @param {string} bodySrc
 * @param {string} [reqName='request']
 * @returns {'request.json' | 'request.formData' | 'request.text' | 'request.arrayBuffer' | 'delegated_helper' | null}
 */
export function classifyBodyParser(bodySrc, reqName = 'request') {
  const reqEsc = reqName.replace(/[$]/g, '\\$');
  const jsonPattern = new RegExp(`(?:${reqEsc}|event\\.request|request|req)\\.json\\s*\\(`, 'i');
  const formDataPattern = new RegExp(`(?:${reqEsc}|event\\.request|request|req)\\.formData\\s*\\(`, 'i');
  const textPattern = new RegExp(`(?:${reqEsc}|event\\.request|request|req)\\.text\\s*\\(`, 'i');
  const arrayBufferPattern = new RegExp(`(?:${reqEsc}|event\\.request|request|req)\\.arrayBuffer\\s*\\(`, 'i');
  const helperPattern = /\b(?:parseBody|readBody|getJson|parsePayload|validateRequest|validateBody|handlePayload)\s*\(/i;

  if (jsonPattern.test(bodySrc)) return 'request.json';
  if (formDataPattern.test(bodySrc)) return 'request.formData';
  if (textPattern.test(bodySrc)) return 'request.text';
  if (arrayBufferPattern.test(bodySrc)) return 'request.arrayBuffer';
  if (helperPattern.test(bodySrc)) return 'delegated_helper';

  return null;
}

/**
 * Classify Zod validation evidence in handler source snippet.
 *
 * @param {string} bodySrc
 * @returns {'safeParse' | 'parse' | 'schema_wrapper' | 'not_proven'}
 */
export function classifyZodValidation(bodySrc) {
  if (/\.safeParse\s*\(/.test(bodySrc)) return 'safeParse';
  if (/\.parse\s*\(/.test(bodySrc)) return 'parse';
  if (/\bz\.(?:object|string|number|record|array|union|enum)\b/.test(bodySrc) || /\bzod\s*\(/.test(bodySrc)) {
    return 'schema_wrapper';
  }
  return 'not_proven';
}

const RE_HANDLER_DECLARATION = /export\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

/**
 * Analyze all route handlers in a SvelteKit +server.ts or +page.server.ts source string.
 *
 * @param {string} src - The full source file content
 * @param {object} [options={}]
 * @param {string} [options.rel='']
 * @param {string} [options.sourceRevision='']
 * @returns {{
 *   parsesBody: boolean,
 *   hasZod: boolean,
 *   handlers: Array<{
 *     method: string,
 *     parsesBody: boolean,
 *     bodyParser: string | null,
 *     zodValidation: string,
 *     analysisStatus: string,
 *     evidenceSpan: { start: number, end: number, lineStart: number, lineEnd: number }
 *   }>
 * }}
 */
export function analyzeRouteHandlers(src, options = {}) {
  const handlers = [];
  const matches = [...src.matchAll(RE_HANDLER_DECLARATION)];

  for (const m of matches) {
    const method = m[1];
    const matchIndex = m.index;

    // Look for opening '{' of function body
    const searchSlice = src.slice(matchIndex, matchIndex + 500);
    const arrowIdx = searchSlice.indexOf('=>');
    let openBraceRel = -1;

    if (arrowIdx !== -1) {
      openBraceRel = searchSlice.indexOf('{', arrowIdx);
    } else {
      // Function declaration: find closing ')' of parameter list first
      const openParenRel = searchSlice.indexOf('(');
      if (openParenRel !== -1) {
        let pDepth = 0;
        let closeParenRel = -1;
        for (let i = openParenRel; i < searchSlice.length; i++) {
          if (searchSlice[i] === '(') pDepth++;
          else if (searchSlice[i] === ')') {
            pDepth--;
            if (pDepth === 0) {
              closeParenRel = i;
              break;
            }
          }
        }
        if (closeParenRel !== -1) {
          openBraceRel = searchSlice.indexOf('{', closeParenRel);
        }
      }
      if (openBraceRel === -1) {
        openBraceRel = searchSlice.indexOf('{');
      }
    }

    let handlerBody = '';
    let spanEnd = matchIndex;
    let analysisStatus = 'complete';

    if (openBraceRel !== -1) {
      const openBraceAbs = matchIndex + openBraceRel;
      const closeBraceAbs = findMatchingBrace(src, openBraceAbs);
      if (closeBraceAbs !== -1) {
        handlerBody = src.slice(openBraceAbs, closeBraceAbs + 1);
        spanEnd = closeBraceAbs + 1;
      } else {
        // Unbalanced brace / truncated
        handlerBody = src.slice(openBraceAbs, Math.min(src.length, openBraceAbs + 2000));
        spanEnd = Math.min(src.length, openBraceAbs + 2000);
        analysisStatus = 'partial';
      }
    } else {
      // Possible delegated alias: export const POST = handlePost;
      const endOfStatement = src.indexOf(';', matchIndex);
      const statement = endOfStatement !== -1 
        ? src.slice(matchIndex, endOfStatement) 
        : searchSlice;
      handlerBody = statement;
      spanEnd = matchIndex + statement.length;
      analysisStatus = 'delegated_unverified';
    }

    // Inspect parameter destructuring for custom request binding name
    let reqBinding = 'request';
    const sigPart = src.slice(matchIndex, openBraceRel !== -1 ? matchIndex + openBraceRel : matchIndex + 100);
    const customReqMatch = sigPart.match(/request\s*:\s*([A-Za-z_$][\w$]*)/);
    if (customReqMatch) {
      reqBinding = customReqMatch[1];
    }

    let bodyParser = classifyBodyParser(handlerBody, reqBinding);
    if (!bodyParser && analysisStatus === 'delegated_unverified') {
      bodyParser = 'delegated_helper';
    }

    const zodValidation = classifyZodValidation(handlerBody);
    const parsesBody = bodyParser !== null;

    // Calculate line numbers
    const linesBeforeStart = src.slice(0, matchIndex).split('\n');
    const lineStart = linesBeforeStart.length;
    const linesBeforeEnd = src.slice(0, spanEnd).split('\n');
    const lineEnd = linesBeforeEnd.length;

    handlers.push({
      method,
      parsesBody,
      bodyParser,
      zodValidation,
      analysisStatus,
      evidenceSpan: {
        start: matchIndex,
        end: spanEnd,
        lineStart,
        lineEnd,
      },
    });
  }

  // File-level aggregate: true if any handler parses body, or fallback regex matches
  const anyHandlerParses = handlers.some((h) => h.parsesBody);
  const fallbackRegexParses = /request\.(?:json|formData|text|arrayBuffer)\s*\(\s*\)/.test(src);
  const parsesBody = anyHandlerParses || fallbackRegexParses;

  // File-level Zod
  const anyHandlerZod = handlers.some((h) => h.zodValidation !== 'not_proven');
  const fallbackZod = /\bz\.\w+|from\s+['"]zod['"]|zodSchema|zod\(|\.safeParse\(|\.parse\(/.test(src);
  const hasZod = anyHandlerZod || fallbackZod;

  return {
    parsesBody,
    hasZod,
    handlers,
  };
}
