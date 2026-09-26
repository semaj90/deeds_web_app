/**
 * Structural symbol extraction for .md files: ATX headings (`# ... ######`) as nested symbols.
 * No third-party markdown parser -- ATX heading detection is a well-bounded, deterministic
 * regex problem and pulling in a full CommonMark parser for this alone would be new-dependency
 * overkill for the one structural signal actually needed here.
 */
import crypto from 'node:crypto';

const SIGNATURE_TEXT_MAX_CHARS = 400;
const ATX_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function fingerprint(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function extractMarkdownSymbols(content, _filePath) {
  const lines = content.split(/\r?\n/);
  const symbols = [];
  const stack = []; // { level, name }
  let byteOffset = 0;

  for (const line of lines) {
    const match = ATX_HEADING.exec(line);
    if (match) {
      const level = match[1].length;
      const name = match[2].trim();

      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parentChain = stack.map((entry) => ({ kind: 'heading', name: entry.name }));

      symbols.push({
        kind: 'heading',
        name,
        start_line: 0,
        end_line: 0,
        start_byte: byteOffset,
        end_byte: byteOffset + line.length,
        signature_text: line.slice(0, SIGNATURE_TEXT_MAX_CHARS),
        hash: fingerprint(line).slice(0, 12),
        ast_fingerprint: fingerprint(line),
        parent_chain: parentChain,
      });

      stack.push({ level, name });
    }
    byteOffset += line.length + 1;
  }

  return symbols;
}

const FENCE_OPEN = /^(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*$/;

/**
 * Detects fenced code blocks (```lang ... ```) and, for each, the nearest enclosing heading name
 * (or null at document top level). Byte offsets are relative to the FULL markdown document (not
 * re-based to the fence), so a caller can slice `content` directly to get the embedded code text.
 * Does not itself decide whether a fence language is admitted as recursable code -- that's the
 * caller's job (see MARKDOWN_FENCE_LANGUAGE_TO_EXT in source-text-envelope.mjs).
 */
export function extractMarkdownFences(content) {
  const lines = content.split(/\r?\n/);
  const fences = [];
  const headingStack = []; // ordered by nesting, top = innermost heading currently in scope
  let byteOffset = 0;
  let open = null; // { fenceChar, language, contentStartByte, startLine }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!open) {
      const headingMatch = ATX_HEADING.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const name = headingMatch[2].trim();
        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
        headingStack.push({ level, name });
      }
      const fenceMatch = FENCE_OPEN.exec(line.trimEnd());
      if (fenceMatch) {
        open = {
          fenceChar: fenceMatch[1][0],
          fenceLen: fenceMatch[1].length,
          language: fenceMatch[2].toLowerCase() || null,
          contentStartByte: byteOffset + line.length + 1,
          startLine: i,
          parentSection: headingStack.length > 0 ? headingStack[headingStack.length - 1].name : null,
        };
      }
    } else {
      const closeMatch = new RegExp(`^\\${open.fenceChar}{${open.fenceLen},}\\s*$`).exec(line.trimEnd());
      if (closeMatch) {
        fences.push({
          language: open.language,
          parentSection: open.parentSection,
          contentStartByte: open.contentStartByte,
          contentEndByte: byteOffset,
          fenceStartByte: open.contentStartByte - (lines[open.startLine].length + 1),
          fenceEndByte: byteOffset + line.length,
        });
        open = null;
      }
    }
    byteOffset += line.length + 1;
  }

  return fences;
}
