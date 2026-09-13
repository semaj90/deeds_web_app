/**
 * SOURCE-TEXT-ENCODING-01
 *
 * SourceTextEnvelopeV1: the boundary between raw file bytes and every downstream parser
 * (TypeScript Compiler API, JSON, Markdown, LSP). Fixes a real gap in the first version of
 * graphify-symbol-extractor-v1.mts: reading everything as hardcoded 'utf8' silently corrupts
 * UTF-16 files, and treating Markdown headings / JSON keys as "symbols" tempts them into
 * graphify_symbols, which is explicitly a deterministic-CODE-symbol table (functions, classes,
 * types) -- not a general document-structure table. atlas_ast_nodes already exists for
 * structural/byte-span evidence across parser languages; non-code documents belong there.
 *
 * Encoding detection is fail-closed: BOM present -> that encoding. No BOM -> must be valid
 * UTF-8 (rejected otherwise). UTF-16 without a BOM is never guessed from NUL-byte heuristics --
 * it is simply not accepted for canonical ingestion. This preserves deterministic identity
 * (the same bytes always decode the same way, never inferred).
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

/** SOURCE_KINDS: extension -> {documentKind, parserLanguage, lspLanguageId}.
 * documentKind governs downstream behavior (see graphify-symbol-extractor-v1.mts):
 *   code      -> symbol nominations allowed (graphify_symbols)
 *   json      -> JSON Pointer structural nodes, NO stableSymbolId, NO symbol promotion (atlas_ast_nodes)
 *   markdown  -> heading/section nodes (atlas_ast_nodes); embedded fenced code MAY recurse into
 *                the code parser and gain real symbol identity, with explicit document/section
 *                provenance -- the heading itself is never a code symbol
 *   plaintext -> document/paragraph nodes only, no symbol promotion (out of scope for v1: no
 *                structural extraction at all yet, reserved for future lexical/NLP enrichment)
 */
export const SOURCE_KINDS = {
  '.ts': { documentKind: 'code', parserLanguage: 'typescript', lspLanguageId: 'typescript' },
  '.mts': { documentKind: 'code', parserLanguage: 'typescript', lspLanguageId: 'typescript' },
  '.tsx': { documentKind: 'code', parserLanguage: 'typescript', lspLanguageId: 'typescriptreact' },
  '.js': { documentKind: 'code', parserLanguage: 'javascript', lspLanguageId: 'javascript' },
  '.mjs': { documentKind: 'code', parserLanguage: 'javascript', lspLanguageId: 'javascript' },
  '.cjs': { documentKind: 'code', parserLanguage: 'javascript', lspLanguageId: 'javascript' },
  '.jsx': { documentKind: 'code', parserLanguage: 'javascript', lspLanguageId: 'javascriptreact' },
  '.json': { documentKind: 'json', parserLanguage: 'json', lspLanguageId: 'json' },
  '.jsonc': { documentKind: 'json', parserLanguage: 'jsonc', lspLanguageId: 'jsonc' },
  '.md': { documentKind: 'markdown', parserLanguage: 'markdown', lspLanguageId: 'markdown' },
  '.markdown': { documentKind: 'markdown', parserLanguage: 'markdown', lspLanguageId: 'markdown' },
  '.txt': { documentKind: 'plaintext', parserLanguage: 'plaintext', lspLanguageId: 'plaintext' },
};

/** Fenced-code language identifiers (```ts, ```typescript, etc.) that map back into SOURCE_KINDS'
 * code extensions, for Markdown's embedded-code recursion. Conservative allowlist -- unknown
 * fence languages are left as non-code evidence, never guessed into a parser. */
export const MARKDOWN_FENCE_LANGUAGE_TO_EXT = {
  ts: '.ts', typescript: '.ts',
  tsx: '.tsx',
  js: '.js', javascript: '.js',
  jsx: '.jsx',
  json: '.json', jsonc: '.jsonc',
};

export function classifySourceKind(sourceRef) {
  const ext = path.extname(sourceRef).toLowerCase();
  return SOURCE_KINDS[ext] ?? null;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function swapUtf16Endianness(buffer) {
  const swapped = Buffer.from(buffer);
  for (let i = 0; i + 1 < swapped.length; i += 2) {
    const hi = swapped[i];
    swapped[i] = swapped[i + 1];
    swapped[i + 1] = hi;
  }
  return swapped;
}

/** Fail-closed UTF-8 validation: reject strings containing the Unicode replacement character
 * that Node's lenient toString('utf8') silently substitutes for invalid byte sequences, and
 * reject any decode/re-encode round-trip mismatch (catches truncated multi-byte sequences at
 * buffer boundaries and other malformed input toString() would otherwise paper over). */
function assertValidUtf8(buffer) {
  const text = buffer.toString('utf8');
  if (text.includes('�') && !buffer.includes(Buffer.from('�', 'utf8'))) {
    throw new Error('SOURCE_TEXT_ENVELOPE_MALFORMED_UTF8');
  }
  if (!Buffer.from(text, 'utf8').equals(buffer)) {
    throw new Error('SOURCE_TEXT_ENVELOPE_MALFORMED_UTF8');
  }
  return text;
}

/**
 * Decodes raw file bytes into a SourceTextEnvelopeV1:
 *   { sourceRef, sourceEncoding, bomBytes, rawContentHash, normalizedUtf8Hash, text,
 *     parserBuffer, documentKind, parserLanguage, lspLanguageId }
 * `text` is the decoded JS string (UTF-16 code units, as every JS string is) -- this is what
 * gets passed to LSP didOpen (LSP 3.17 negotiates position encoding but keeps UTF-16 as the
 * mandatory default; never hand it raw file bytes). `parserBuffer` is ALWAYS re-encoded to
 * normalized UTF-8 regardless of source encoding, so every parser (TS Compiler API, JSON,
 * Markdown) operates on one consistent byte representation.
 *
 * Fail-closed: BOM-less UTF-16 is never accepted (would require guessing); malformed UTF-8
 * throws SOURCE_TEXT_ENVELOPE_MALFORMED_UTF8. Unsupported extensions return documentKind=null
 * inputs are still decoded (identity is always computable) but the caller should skip structural
 * extraction for them.
 */
export function decodeSourceTextEnvelope(rawBuffer, sourceRef) {
  const rawContentHash = sha256Hex(rawBuffer);
  let sourceEncoding;
  let bomBytes;
  let text;

  if (rawBuffer.subarray(0, 3).equals(UTF8_BOM)) {
    sourceEncoding = 'utf-8';
    bomBytes = 3;
    text = assertValidUtf8(rawBuffer.subarray(3));
  } else if (rawBuffer.subarray(0, 2).equals(UTF16_LE_BOM)) {
    sourceEncoding = 'utf-16le';
    bomBytes = 2;
    text = rawBuffer.subarray(2).toString('utf16le');
  } else if (rawBuffer.subarray(0, 2).equals(UTF16_BE_BOM)) {
    sourceEncoding = 'utf-16be';
    bomBytes = 2;
    text = swapUtf16Endianness(rawBuffer.subarray(2)).toString('utf16le');
  } else {
    sourceEncoding = 'utf-8';
    bomBytes = 0;
    text = assertValidUtf8(rawBuffer);
  }

  const parserBuffer = Buffer.from(text, 'utf8');
  const normalizedUtf8Hash = sha256Hex(parserBuffer);
  const kind = classifySourceKind(sourceRef);

  return {
    sourceRef,
    sourceEncoding,
    bomBytes,
    rawContentHash,
    normalizedUtf8Hash,
    text,
    parserBuffer,
    documentKind: kind?.documentKind ?? null,
    parserLanguage: kind?.parserLanguage ?? null,
    lspLanguageId: kind?.lspLanguageId ?? null,
  };
}

/** Converts a UTF-8 byte offset into parserBuffer to an LSP {line, character} position, where
 * `character` is expressed in UTF-16 code units per LSP's mandatory-default position encoding
 * (LSP 3.17 lets client/server negotiate utf-8/utf-16/utf-32, but this repo's resolver only ever
 * advertises utf-16 -- see the LSP client's initialize capabilities). Rejects an offset that
 * splits a UTF-8 continuation byte or a UTF-16 surrogate pair, rather than silently returning a
 * corrupt position. */
export function byteOffsetToPosition(parserBuffer, byteOffset) {
  if (byteOffset < 0 || byteOffset > parserBuffer.length) {
    throw new Error(`SOURCE_TEXT_ENVELOPE_OFFSET_OUT_OF_RANGE:${byteOffset}`);
  }
  // A UTF-8 continuation byte is 10xxxxxx (0x80-0xBF); splitting here means the caller computed
  // an offset mid-character.
  if (byteOffset < parserBuffer.length) {
    const byte = parserBuffer[byteOffset];
    if ((byte & 0xc0) === 0x80) {
      throw new Error(`SOURCE_TEXT_ENVELOPE_OFFSET_SPLITS_UTF8_CODEPOINT:${byteOffset}`);
    }
  }

  const prefix = parserBuffer.subarray(0, byteOffset).toString('utf8');
  let line = 0;
  let lastNewline = -1;
  for (let i = 0; i < prefix.length; i += 1) {
    if (prefix.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      lastNewline = i;
    }
  }
  // character is a UTF-16 code-unit count from the start of the line -- prefix.length already
  // counts JS string (UTF-16) code units, so no further conversion is needed here; a lone
  // trailing high surrogate (an offset that split a surrogate pair) is rejected explicitly.
  const character = prefix.length - (lastNewline + 1);
  const lastCode = prefix.charCodeAt(prefix.length - 1);
  if (prefix.length > 0 && lastCode >= 0xd800 && lastCode <= 0xdbff) {
    throw new Error(`SOURCE_TEXT_ENVELOPE_OFFSET_SPLITS_SURROGATE_PAIR:${byteOffset}`);
  }
  return { line, character };
}
