/**
 * Loads AST provider capability from the LIVE owners instead of a hand-copied list.
 *  - node-tree-sitter provider (TS): grammar vocabulary via nodeTreeSitterProviderLanguageVocabularyV1()
 *  - NLP sidecar (python): treesitter-chunker capabilities().ast (extension -> sidecar language bindings)
 * Anything that cannot be loaded is reported as AST_PROVIDER_CAPABILITY_CONTRACT_REQUIRED, never guessed.
 * Analysis kind is CODE_AST for both; no live owner exports DOCUMENT/CONFIG structure capability.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { REPO_ROOT } from '../connection-config.mjs';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const lastJsonLine = (out) => JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).at(-1));

export function loadLiveAstProviderCapabilityContractV1() {
  const missing = [];
  let node = null; let sidecar = null;
  try {
    node = lastJsonLine(run('npx', ['tsx', '-e', '"import(\'./src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts\').then(m=>console.log(JSON.stringify(m.nodeTreeSitterProviderLanguageVocabularyV1())))"'], path.join(REPO_ROOT, 'sveltekit-frontend')));
  } catch (e) { missing.push('node-tree-sitter provider vocabulary not importable'); }
  try {
    sidecar = lastJsonLine(run('python', ['-c', '"import json;from python.miniforge_nlp_sidecar import capabilities as c;a=c()[\'ast\'];print(json.dumps({\'engine\':a[\'engine\'],\'available\':a[\'available\'],\'vocab\':a[\'languageVocabularies\'],\'bindings\':a[\'languageBindings\']}))"'], REPO_ROOT));
  } catch (e) { missing.push('sidecar capabilities() not loadable'); }
  if (!node || !sidecar) return { status: 'AST_PROVIDER_CAPABILITY_CONTRACT_REQUIRED', missing };

  const extToLanguage = Object.fromEntries(sidecar.bindings.map((b) => [b.fromLabel, b.toLabel]));
  const nodeGrammars = new Set(node.labels);
  // extension -> node-tree-sitter grammar id, derived: sidecar language binding intersected with provider grammar ids
  // ('jsx'/'tsx' come from the extension itself where the sidecar or provider names them).
  const nodeExt = Object.entries(extToLanguage).filter(([ext, lang]) => nodeGrammars.has(lang) || nodeGrammars.has(ext.slice(1))).map(([ext]) => ext);
  return {
    status: 'LOADED',
    providers: [
      { providerId: 'node-tree-sitter-ast-provider', analysisKind: 'CODE_AST', languageIds: node.labels, extensions: nodeExt, contractRevision: node.sourceRevision, owner: node.sourceOwner, versionSource: 'runtime package versions (tree-sitter, tree-sitter-typescript/javascript) recorded on rows as engine_version/grammar_version' },
      { providerId: 'miniforge-nlp-sidecar/treesitter-chunker', analysisKind: 'CODE_AST', languageIds: sidecar.vocab.find((v) => v.namespace === 'SIDECAR_LANGUAGE').labels, extensions: Object.keys(extToLanguage), contractRevision: sidecar.vocab[0].sourceRevision, owner: sidecar.vocab[0].sourceOwner, engineAvailable: sidecar.available },
    ],
    extToLanguage,
    missing,
  };
}
