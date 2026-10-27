import { analyzeLexicalScopes } from './ast-lexical-scope-v1.mjs';

/**
 * Svelte <script> support (pure, lexical only). Extracts script blocks from the exact source text and runs the TS/JS lexical scope analysis on each,
 * shifting spans to absolute UTF-8 byte offsets in the .svelte file. Template expressions ({...}, directives) are NOT analysed: identifiers used only in
 * the template are reported as template-unanalysed by the caller, never as free or resolved. Svelte 5 runes are compiler globals, listed explicitly.
 */
export const SVELTE_RUNES = Object.freeze(['$state', '$derived', '$effect', '$props', '$bindable', '$inspect', '$host']);

export function extractScriptBlocks(source) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const attrs = m[1];
    const contentStart = m.index + m[0].indexOf('>') + 1;
    const lang = /\blang\s*=\s*["']?(ts|typescript)["']?/i.test(attrs) ? 'typescript' : 'javascript';
    blocks.push({ attrs: attrs.trim(), language: lang, module: /\bmodule\b|context\s*=\s*["']module["']/i.test(attrs), text: m[2], utf16Start: contentStart, utf8Start: Buffer.byteLength(source.slice(0, contentStart), 'utf8') });
  }
  return blocks;
}

export function analyzeSvelteScripts(source) {
  const blocks = extractScriptBlocks(source);
  const occurrences = []; const bindings = []; const unsupported = [];
  blocks.forEach((block, index) => {
    // Runes are not identifiers in scope; they parse as calls to identifiers such as $state and would be FREE otherwise.
    const result = analyzeLexicalScopes({ source: block.text, language: block.language });
    if (result.outcome === 'PARSE_UNSUPPORTED') { unsupported.push({ block: index, reason: result.parseErrors ? 'SYNTAX_ERROR' : 'LANGUAGE' }); return; }
    const shift = (item) => ({ ...item, block: index, startByte: item.startByte + block.utf8Start, endByte: item.endByte + block.utf8Start });
    for (const o of result.occurrences) occurrences.push(SVELTE_RUNES.includes(o.name) && o.outcome === 'FREE_IDENTIFIER' ? shift({ ...o, outcome: 'GLOBAL_OR_BUILTIN_CANDIDATE', note: 'svelte-rune' }) : shift(o));
    for (const b of result.bindings) bindings.push(shift(b));
  });
  return { blocks: blocks.length, occurrences, bindings, unsupported, templateAnalyzed: false };
}
