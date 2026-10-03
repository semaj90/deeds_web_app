#!/usr/bin/env node
/**
 * Read-only census of chat/embedding ownership.
 *
 * The active synthesis owner is discovered from the existing llama-server
 * compatibility receipt. Ollama references are classified, not rewritten:
 * EmbeddingGemma may remain on the embedding lane while legacy chat names are
 * reported for bounded migration review.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(repoRoot, 'docs/reports/chat-model-ownership-v1.json');
const compatibilityPath = path.resolve(repoRoot, 'docs/reports/llama-server-8090-compatibility-v1.json');

const roots = [
  path.resolve(repoRoot, 'sveltekit-frontend/src/lib/server'),
  path.resolve(repoRoot, 'scripts/atlas'),
];
const ignored = new Set(['node_modules', '.git', 'reports', 'coverage', '.svelte-kit']);
const extensions = new Set(['.ts', '.mts', '.js', '.mjs', '.py', '.json', '.md']);

async function walk(directory, out = []) {
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(repoRoot, file).replaceAll(path.sep, '/'); }
function executableLineMatches(text, pattern) {
  return text.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => text && !/^(?:\/\/|\/\*|\*|#)/.test(text) && pattern.test(text));
}

let compatibility = null;
try { compatibility = JSON.parse(await fs.readFile(compatibilityPath, 'utf8')); } catch { /* absent is reported */ }

const files = (await Promise.all((await Promise.all(roots.map((root) => walk(root)))).flat().map(async (file) => {
  try { return { file, text: await fs.readFile(file, 'utf8') }; } catch { return null; }
}))).filter(Boolean);

const directOllamaChat = [];
const legacyChatNames = [];
const embeddingOllamaReferences = [];
const activeLlamaReferences = [];

for (const { file, text } of files) {
  if (file === path.resolve(repoRoot, 'scripts/atlas/audit-chat-model-ownership-v1.mjs')
    || file === path.resolve(repoRoot, 'scripts/atlas/audit-ollama-generation-callers-v2.mjs')) continue;
  const directChat = /(?:ChatOllama|new\s+Ollama\s*\(|(?:fetch|postJson)\([^\n]*(?:getOllamaEndpoint|OLLAMA(?:_BASE_URL|_URL|_HOST))[^\n]*(?:chat\/completions|api\/(?:generate|chat)))/i;
  const legacy = /gemma4-rotorquant|Gemma4|GEMMA4/i;
  const embedding = /embeddinggemma|ollama-embed|OLLAMA_EMBED/i;
  const llama = /llama-server|LLAMA_SERVER_URL|ornith-1\.5/i;
  for (const match of executableLineMatches(text, directChat)) directOllamaChat.push({ file: rel(file), ...match });
  for (const match of executableLineMatches(text, legacy)) legacyChatNames.push({ file: rel(file), ...match });
  for (const match of executableLineMatches(text, embedding)) embeddingOllamaReferences.push({ file: rel(file), ...match });
  for (const match of executableLineMatches(text, llama)) activeLlamaReferences.push({ file: rel(file), ...match });
}

const modelId = compatibility?.model?.id ?? compatibility?.props?.modelAlias ?? null;
const endpointHealthy = compatibility?.health?.status === 200;
const activeOwnerProven = endpointHealthy && modelId === 'ornith-1.5-9b';
const report = {
  schema: 'atlas.chat-model-ownership.v1',
  status: activeOwnerProven
    ? (directOllamaChat.length ? 'OWNER_PROVEN_WITH_DIRECT_OLLAMA_CHAT_REVIEW' : 'OWNER_PROVEN_WITH_LEGACY_REVIEW')
    : 'ACTIVE_CHAT_OWNER_UNPROVEN',
  activeChatOwner: { provider: 'llama-server', endpoint: 'http://127.0.0.1:8090/v1', modelId, healthStatus: compatibility?.health?.status ?? null },
  ollamaEmbeddingOwner: { provider: 'ollama', endpoint: 'http://127.0.0.1:11434', role: 'EMBEDDINGGEMMA_ONLY' },
  legacyChatNames: legacyChatNames.length,
  directOllamaChatCallsites: directOllamaChat,
  embeddingOllamaReferences: embeddingOllamaReferences.length,
  activeLlamaReferences: activeLlamaReferences.length,
  compatibilityReceipt: compatibilityPath,
  modelChecksum: compatibility?.model?.digest ?? null,
  policy: {
    ollamaChatAllowed: false,
    llamaServerChatAllowed: true,
    legacyNamesAreAuthority: false,
    canonicalAuthority: false,
    writesPerformed: false,
  },
  writesPerformed: false,
  canonicalAuthority: false,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, modelId, directOllamaChat: directOllamaChat.length, legacyChatNames: legacyChatNames.length }));
