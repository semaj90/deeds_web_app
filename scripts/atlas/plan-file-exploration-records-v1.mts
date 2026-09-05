import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/file-exploration-record-plan-v1.json');
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.file-exploration-record-plan.v1',
});

const languageFor = (sourceRef: string) => {
  const extension = sourceRef.split('.').pop()?.toLowerCase() ?? '';
  return ({ ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', mts: 'typescript', py: 'python', go: 'go', rs: 'rust', java: 'java', sql: 'sql', md: 'markdown', mdx: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml' } as Record<string, string>)[extension] ?? 'unknown';
};
const flagsFor = (sourceRef: string) => {
  const lower = sourceRef.toLowerCase();
  return [
    /(^|\/)(test|tests|__tests__|fixtures?)\//.test(lower) ? 'TEST' : null,
    /(^|\/)(generated|dist|build|coverage)\//.test(lower) ? 'GENERATED' : null,
    /(^|\/)(archive|archived)\//.test(lower) ? 'ARCHIVE' : null,
    /(^|\/)(mock|mocks|stub|stubs)\//.test(lower) ? 'MOCK' : null,
    /\.okf\.|(^|\/)(openspec|docs)\//.test(lower) ? 'DOCUMENTATION' : null,
  ].filter((flag): flag is string => Boolean(flag));
};
const estimateTokens = (bytes: number) => Math.max(1, Math.ceil(bytes / 4));
const sampleLimit = Number.parseInt(process.env.FEI_RECORD_SAMPLE_SIZE ?? '12', 10);
const records = [];
const languageCounts: Record<string, number> = {};
let totalBytes = 0;

for (const binding of origin.bindings) {
  const bytes = await readFile(resolve(root, binding.sourceRef));
  const language = languageFor(binding.sourceRef);
  const flags = flagsFor(binding.sourceRef);
  const lineCount = bytes.length === 0 ? 0 : bytes.toString('utf8').split(/\r?\n/).length;
  const record = {
    sourceRef: binding.sourceRef,
    workspaceRevision: origin.record.workspaceRevision,
    sourceRevision: binding.sourceRevision,
    contentHash: `sha256:${binding.contentDigest}`,
    language,
    extension: binding.sourceRef.includes('.') ? `.${binding.sourceRef.split('.').pop()}` : null,
    byteLength: bytes.byteLength,
    lineCount,
    directory: binding.sourceRef.includes('/') ? binding.sourceRef.slice(0, binding.sourceRef.lastIndexOf('/')) : '',
    basename: binding.sourceRef.split('/').pop() ?? binding.sourceRef,
    flags,
    searchDocument: `${language} ${binding.sourceRef} ${flags.join(' ')}`.trim(),
    contextCost: {
      metadataTokens: estimateTokens(binding.sourceRef.length + language.length + flags.join(' ').length),
      estimatedTokensFullFile: estimateTokens(bytes.byteLength),
      estimatedTokensSelectedSpans: Math.min(estimateTokens(bytes.byteLength), 500),
    },
    structuralDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    canonicalAuthority: false,
  };
  records.push(record);
  languageCounts[language] = (languageCounts[language] ?? 0) + 1;
  totalBytes += bytes.byteLength;
}

const report = {
  schema: 'atlas.file-exploration-record-plan.v1',
  status: records.length === origin.record.sourceCount ? 'FILE_RECORD_PLAN_PROVEN_READ_ONLY' : 'FILE_RECORD_PLAN_COUNT_MISMATCH',
  gate: 'ATLAS-FILE-EXPLORATION-INDEX-04',
  workspaceRevision: origin.record.workspaceRevision,
  sourceCount: origin.record.sourceCount,
  recordCount: records.length,
  totalBytes,
  languageCounts,
  sampleRecords: records.slice(0, Math.max(1, sampleLimit)),
  astGrep: { provider: 'existing @ast-grep/napi adapter', role: 'observation only', promotion: 'blocked until exact source/chunk admission' },
  embeddings: { representation: 'semantic_768', status: 'not run', promotion: 'blocked' },
  persistence: { postgres: 'not run', qdrant: 'not run', goRetrieval: 'not run', valkey: 'not run' },
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, sourceCount: report.sourceCount, recordCount: report.recordCount, totalBytes: report.totalBytes, report: reportPath }, null, 2));
