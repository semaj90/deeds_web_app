import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { requestDocumentSymbolsOnce } from './lsp-client.mjs';

const LSP_LANGUAGE_IDS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescriptreact'], ['.js', 'javascript'], ['.jsx', 'javascriptreact'],
  ['.mts', 'typescript'], ['.cts', 'typescript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
]);

export async function runIndexedSourceLspV1({ repoRoot, sourceRef, absolutePath, sourceText }) {
  const languageId = LSP_LANGUAGE_IDS.get(path.extname(sourceRef).toLowerCase());
  if (!languageId) return { status: 'SKIPPED_UNSUPPORTED_LANGUAGE', symbolCount: 0 };
  const cli = path.join(repoRoot, 'sveltekit-frontend', 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs');
  if (!fs.existsSync(cli)) return { status: 'UNAVAILABLE_LANGUAGE_SERVER', symbolCount: 0 };
  const symbols = await requestDocumentSymbolsOnce({
    command: process.execPath,
    args: [cli, '--stdio'],
    languageId,
    content: sourceText,
    fileUri: pathToFileURL(absolutePath).toString(),
    timeoutMs: 20000,
  });
  return { status: 'OBSERVED', symbolCount: Array.isArray(symbols) ? symbols.length : 0 };
}
