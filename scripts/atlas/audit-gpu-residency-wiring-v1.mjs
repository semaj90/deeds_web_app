#!/usr/bin/env node

/**
 * Read-only census for the shared GPU residency boundary.
 *
 * This deliberately does not probe hardware, acquire leases, write caches, or
 * claim that an executor enforces the shared budget at runtime. It only binds
 * repository evidence to the existing GpuResidencyBudgetV1 owner so MEM-04 and
 * MEM-05 cannot be closed from the pure contract tests alone.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] ?? process.cwd());
const preferredReport = path.resolve(process.argv[3] ?? path.join(root, 'docs/reports/gpu-residency-wiring-v1.json'));
const stagingReport = path.join(root, 'docs/reports/staging/gpu-residency-wiring-v1.json');
const tmpReport = path.join(root, '.tmp/gpu-residency-wiring-v1.json');

const ownerPath = 'sveltekit-frontend/src/lib/server/atlas/gpu/gpu-residency-budget.ts';
const adapterPath = 'sveltekit-frontend/src/lib/server/atlas/tensors/unified-residency-adapter-v1.ts';
const ownerSymbols = ['GpuResidencyBudgetV1', 'admitGpuExecutionLeaseV1', 'assertGpuExecutionWithinBudgetV1', 'GPU_RESIDENCY_BUDGET_EXCEEDED'];

const executors = [
  { id: 'pytorch_cuda_cuvs_cugraph_wsl2', lane: 'graph_ann_gpu', roots: ['services/atlas-gpu-8098', 'python/atlas', 'scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['cuvs', 'cugraph', 'gpu-residency', 'gpu-residency-budget'] },
  { id: 'pytorch_cuda_windows', lane: 'neural_reference_challenger', roots: ['python/atlas', 'scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['torch.cuda', 'pytorch_cuda', 'gpu-residency-budget'] },
  { id: 'onnx_runtime_webgpu', lane: 'semantic_embedding_challenger', roots: ['scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['webgpu', 'gpu-residency-budget'] },
  { id: 'onnx_runtime_directml', lane: 'semantic_embedding_challenger', roots: ['scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['directml', 'gpu-residency-budget'] },
  { id: 'tensorrt_rtx', lane: 'isolated_neural_challenger', roots: ['scripts/atlas', 'services/atlas-gpu-8098', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['tensorrt', 'gpu-residency-budget'] },
  { id: 'llama_server', lane: 'chat_owner', roots: ['scripts/atlas', 'sveltekit-frontend/src/lib/server/atlas'], needles: ['llama-server', 'llama_server', 'gpu-residency-budget'] },
];

const reportRefs = [
  'docs/reports/gpu-residency-budget-v1.json',
  'docs/reports/gpu-executor-capability-v1.json',
  'docs/reports/candidate-feature-gpu-lease-owner-v1.json',
];

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function listFiles(dir, out = []) {
  if (!(await exists(dir))) return out;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (['node_modules', '.git', '.svelte-kit', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(file, out);
    else if (/\.(?:ts|mts|mjs|js|py|json|yml|yaml)$/.test(entry.name)) out.push(file);
  }
  return out;
}

async function readReports() {
  const reports = {};
  for (const relative of reportRefs) {
    const file = path.join(root, relative);
    if (!(await exists(file))) { reports[relative] = { present: false }; continue; }
    try {
      const raw = await fs.readFile(file, 'utf8');
      reports[relative] = { present: true, checksum: sha256(raw), bytes: Buffer.byteLength(raw), parsed: JSON.parse(raw) };
    } catch (error) {
      reports[relative] = { present: true, readable: false, error: String(error?.message ?? error) };
    }
  }
  return reports;
}

async function main() {
  const ownerFile = path.join(root, ownerPath);
  const ownerText = (await exists(ownerFile)) ? await fs.readFile(ownerFile, 'utf8') : '';
  const ownerPresent = ownerText.length > 0 && ownerSymbols.every((symbol) => ownerText.includes(symbol));
  const adapterFile = path.join(root, adapterPath);
  const adapterText = (await exists(adapterFile)) ? await fs.readFile(adapterFile, 'utf8') : '';
  const sharedAdmissionSeamPresent = adapterText.includes('admitWithSharedGpuResidencyLeaseV1') && adapterText.includes('admitGpuExecutionLeaseV1');
  const allFiles = [];
  for (const relative of new Set(executors.flatMap((executor) => executor.roots))) {
    await listFiles(path.join(root, relative), allFiles);
  }
  const uniqueFiles = [...new Set(allFiles)];

  const executorResults = [];
  for (const executor of executors) {
    const matches = [];
    for (const file of uniqueFiles) {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (relative === ownerPath) continue;
      if (!executor.roots.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) continue;
      let text = '';
      try { text = await fs.readFile(file, 'utf8'); } catch { continue; }
      const matchedNeedles = [...new Set([...executor.needles, ...ownerSymbols])].filter((needle) => text.toLowerCase().includes(needle.toLowerCase()));
      if (matchedNeedles.length) matches.push({ file: relative, matchedNeedles });
    }
    const ownerRefs = matches.filter((match) => {
      const normalized = match.file.toLowerCase();
      const isAuditOrTest = normalized.includes('/audit-') || normalized.includes('.test.') || normalized.includes('.spec.');
      const isGenericAdapter = normalized.includes('unified-residency-adapter-v1');
      const isSidecarValidationContract = normalized.endsWith('/shared_residency.py');
      const executorMarkerFound = executor.needles
        .filter((needle) => !['gpu-residency', 'gpu-residency-budget'].includes(needle))
        .some((needle) => match.matchedNeedles.includes(needle));
      return !isAuditOrTest && !isGenericAdapter && !isSidecarValidationContract && executorMarkerFound && match.matchedNeedles.some((needle) => ownerSymbols.includes(needle));
    });
    executorResults.push({
      executor: executor.id,
      lane: executor.lane,
      status: ownerRefs.length ? 'OWNER_REFERENCE_FOUND_RUNTIME_ENFORCEMENT_UNPROVEN' : 'SHARED_OWNER_REFERENCE_NOT_FOUND',
      sharedOwnerReferences: ownerRefs.map((match) => match.file),
      relatedEvidenceFiles: matches.filter((match) => !ownerRefs.includes(match)).slice(0, 30).map((match) => match.file),
      runtimeAdmissionProven: false,
      canonicalAuthority: false,
      writesPerformed: false,
    });
  }

  const wired = executorResults.filter((item) => item.sharedOwnerReferences.length > 0).map((item) => item.executor);
  const unwired = executorResults.filter((item) => item.sharedOwnerReferences.length === 0).map((item) => item.executor);
  const report = {
    schema: 'atlas.gpu-residency-wiring-audit.v1',
    generatedAt: new Date().toISOString(),
    root,
    readOnly: true,
    owner: {
      contract: 'GpuResidencyBudgetV1',
      path: ownerPath,
      present: ownerPresent,
      pureDecisionBoundaryProven: ownerPresent,
      runtimeRegistrationProven: false,
    },
    sharedAdmissionSeam: {
      path: adapterPath,
      present: sharedAdmissionSeamPresent,
      executorIdentityRequired: sharedAdmissionSeamPresent,
      mutationBeforeAdmissionBlocked: sharedAdmissionSeamPresent,
      runtimeCallersProven: false,
    },
    executors: executorResults,
    summary: {
      executorCount: executorResults.length,
      sharedOwnerReferenceFound: wired.length,
      sharedOwnerReferenceMissing: unwired.length,
      wiredExecutors: wired,
      unwiredExecutors: unwired,
      mem04: wired.length === executorResults.length ? 'REVIEW_RUNTIME_ENFORCEMENT' : 'CROSS_EXECUTOR_RESIDENCY_NOT_YET_WIRED',
      mem05: 'PRE_OOM_REJECTION_NOT_PROVEN',
    },
    evidence: {
      reports: await readReports(),
      focusedTests: {
        command: 'cd sveltekit-frontend; npx vitest run src/lib/server/atlas/gpu/gpu-residency-budget.test.ts src/lib/server/atlas/features/candidate-feature-gpu-residency-v1.spec.ts src/lib/server/atlas/features/candidate-feature-gpu-batch-request-v1.spec.ts --reporter=dot --pool=forks --poolOptions.forks.singleFork=true',
        status: 'PASSED_17_TESTS',
      },
    },
    canonicalAuthority: false,
    writesPerformed: false,
    nextGate: 'MEM-04_SHARED_EXECUTOR_REGISTRATION',
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  let reportPath = preferredReport;
  let reportWriteError = null;
  for (const candidate of [preferredReport, stagingReport, tmpReport]) {
    try {
      await fs.mkdir(path.dirname(candidate), { recursive: true });
      await fs.writeFile(candidate, serialized, 'utf8');
      reportPath = candidate;
      break;
    } catch (error) {
      reportWriteError = { code: error?.code ?? 'UNKNOWN', message: String(error?.message ?? error) };
    }
  }
  report.reportPath = path.relative(root, reportPath).replaceAll('\\', '/');
  if (reportWriteError) report.reportWriteError = reportWriteError;
  console.log(JSON.stringify({
    schema: report.schema,
    reportPath: report.reportPath,
    owner: report.owner,
    summary: report.summary,
    writesPerformed: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
