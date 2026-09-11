import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { classifyRequirementPin } from './lib/python-requirement-pin-v1.mjs';
import { classifyImageReference, parseDockerBaseReferences } from './lib/docker-base-references-v1.mjs';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'docker-reproducibility-v1.json');
const ignored = new Set([
  '.git', 'node_modules', '.tmp', 'dist', 'build', 'coverage',
  '.svelte-kit', '.next', '.venv', 'venv', '__pycache__',
  'models', 'memory', 'target', 'vendor', '.cache',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function observeActiveContainers() {
  try {
    const ids = execFileSync('docker', ['ps', '-q'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map((id) => id.trim()).filter(Boolean);
    return ids.map((id) => {
      const inspected = JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
      const imageId = inspected.Image ?? null;
      let repoDigests = [];
      let imageInspectionError = null;
      let platform = null;
      try {
        const image = JSON.parse(execFileSync('docker', ['image', 'inspect', imageId], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }))[0];
        repoDigests = image.RepoDigests ?? [];
        platform = `${image.Os}/${image.Architecture}${image.Variant ? `/${image.Variant}` : ''}`;
      } catch (error) { imageInspectionError = error.message; }
      return {
        containerId: id,
        name: inspected.Name?.replace(/^\//, '') ?? null,
        configuredImage: inspected.Config?.Image ?? null,
        imageId,
        imageInspectionReference: imageId,
        state: inspected.State?.Status ?? null,
        healthStatus: inspected.State?.Health?.Status ?? 'NOT_CONFIGURED',
        platform,
        imageInspectionError,
        repoDigests,
        parityStatus: imageInspectionError ? 'IMAGE_INSPECTION_FAILED' : repoDigests.length ? 'REGISTRY_DIGEST_OBSERVED' : 'LOCAL_IMAGE_DIGEST_ONLY',
      };
    });
  } catch {
    return [];
  }
}

function classifyBase(image) {
  return classifyImageReference(image);
}

const files = walk(root);
const dockerfiles = files.filter((file) => /^(?:Dockerfile(?:\..*)?|.+\.Dockerfile)$/i.test(path.basename(file)));
const composeFiles = files.filter((file) => /^(?:docker-compose(?:\..*)?|compose(?:\..*)?)\.(?:ya?ml)$/i.test(path.basename(file)));
function classifyComposeFile(file) {
  const normalized = rel(file).toLowerCase();
  if (/(^|\/)(archive|archives|backup|backups|root-archive)(\/|$)/.test(normalized) ||
      normalized.includes('/root-archive-') || normalized.includes('/archived/')) {
    return 'ARCHIVED_OR_FIXTURE';
  }
  if (/(^|\/)(fixtures?|examples?|e2e|tests?)(\/|[-_])/.test(normalized) ||
      /(^|[-_.])(fixture|example|e2e|test)([-_.]|$)/.test(path.basename(normalized))) {
    return 'ARCHIVED_OR_FIXTURE';
  }
  return 'CURRENT_ORCHESTRATOR';
}

function composeServiceBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const service = line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:#.*)?$/);
    if (service) {
      if (current) blocks.push(current);
      current = { service: service[1], lines: [] };
      continue;
    }
    if (current) {
      const nonEmpty = line.trim();
      if (nonEmpty && !/^\s{2,}/.test(line) && !/^\s*#/.test(line)) {
        blocks.push(current);
        current = null;
      } else {
        current.lines.push(line);
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

const composeImageRefs = composeFiles.flatMap((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const fileScope = classifyComposeFile(file);
  const blocks = composeServiceBlocks(text);
  return blocks.flatMap((block) => {
    const imageMatch = block.lines.join('\n').match(/^\s*image:\s*([^\s#]+)\s*$/im);
    if (!imageMatch) return [];
    const buildBacked = /^\s*build:\s*(?:[^#\s].*)?$/im.test(block.lines.join('\n'));
    const pinStatus = classifyBase(imageMatch[1]);
    return [{
      composeFile: rel(file),
      service: block.service,
      scope: fileScope,
      buildBacked,
      image: imageMatch[1],
      pinStatus,
      enforcementScope: fileScope === 'CURRENT_ORCHESTRATOR' && !buildBacked
        ? 'ACTIVE_EXTERNAL_IMAGE'
        : buildBacked ? 'BUILD_BACKED_LOCAL_IMAGE' : 'ARCHIVED_OR_FIXTURE',
    }];
  });
});
const currentComposeExternalRefs = composeImageRefs.filter((i) => i.enforcementScope === 'ACTIVE_EXTERNAL_IMAGE');
const archivedComposeRefs = composeImageRefs.filter((i) => i.enforcementScope === 'ARCHIVED_OR_FIXTURE');
const buildBackedComposeRefs = composeImageRefs.filter((i) => i.enforcementScope === 'BUILD_BACKED_LOCAL_IMAGE');
const manifests = files.filter((file) => /^(requirements(?:-[^.]*)?|requirements)\.(txt|in)$/i.test(path.basename(file)) || path.basename(file) === 'pyproject.toml');

const containers = dockerfiles.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const bases = parseDockerBaseReferences(text);
  const installLines = text.split(/\r?\n/).filter((line) => /pip(?:3)?\s+install/i.test(line));
  const destructiveBuildSteps = text.split(/\r?\n/).filter((line) => /pip\s+uninstall|apt(?:-get)?\s+(?:remove|purge)|conda\s+(?:remove|uninstall)/i.test(line));
  return {
    dockerfile: rel(file),
    baseImages: bases,
    pipInstallStepCount: installLines.length,
    pipInstallSteps: installLines.map((line) => line.trim()),
    destructivePackageSteps: destructiveBuildSteps.map((line) => line.trim()),
    reproducibilityStatus: bases.some((base) => !['DIGEST_PINNED', 'NO_EXTERNAL_BASE'].includes(base.pinStatus)) || installLines.length > 0
      ? 'REVIEW_REQUIRED'
      : 'NO_PYTHON_INSTALL_OBSERVED',
  };
});

const pythonManifests = manifests.map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  const exact = lines.filter((line) => /==/.test(line));
  const loose = lines.filter((line) => /(?:>=|<=|~=|(?<![=!<>])>(?!=)|(?<![=!<>])<(?!=))/.test(line));
  const declarations = path.basename(file) === 'pyproject.toml' ? [] : lines.map((line) => ({ declaration: line.trim(), classification: classifyRequirementPin(line) }));
  const unresolved = declarations.filter((item) => !['IGNORED', 'INSTALL_OPTION', 'EXACT_VERSION', 'IMMUTABLE_VCS_COMMIT', 'HASHED_ARTIFACT'].includes(item.classification));
  return {
    manifest: rel(file),
    containerScoped: /^(docker|services)\//.test(rel(file)),
    scopeEvidence: 'DIRECTORY_HEURISTIC_ONLY_BUILD_REACHABILITY_NOT_PROVEN',
    exactRequirementCount: exact.length,
    looseRequirementCount: loose.length,
    looseRequirements: loose.map((line) => line.trim()),
    declarations,
    unresolvedDeclarationCount: unresolved.length,
    status: path.basename(file) === 'pyproject.toml' ? 'PYPROJECT_REQUIRES_STRUCTURED_REVIEW' : unresolved.length === 0 ? 'EXACT_DIRECT_REQUIREMENTS' : 'LOOSE_OR_RANGE_REQUIREMENTS',
  };
});

function exactPackageVersion(text, packageName) {
  const match = text.match(new RegExp(`^\\s*${packageName}==([^\\s#]+)`, 'im'));
  return match?.[1] ?? null;
}

const dependencyContractMismatches = [];
for (const container of containers) {
  const dockerfileText = fs.readFileSync(path.join(root, container.dockerfile), 'utf8');
  const directory = path.posix.dirname(container.dockerfile);
  const manifest = pythonManifests.find((candidate) =>
    path.posix.dirname(candidate.manifest) === directory && /requirements\.(txt|in)$/i.test(candidate.manifest),
  );
  if (!manifest) continue;
  const manifestText = fs.readFileSync(path.join(root, manifest.manifest), 'utf8');
  for (const packageName of ['torch', 'torchvision', 'torchaudio']) {
    const dockerVersion = exactPackageVersion(dockerfileText, packageName);
    const manifestVersion = exactPackageVersion(manifestText, packageName);
    if (dockerVersion && manifestVersion && dockerVersion !== manifestVersion) {
      dependencyContractMismatches.push({
        dockerfile: container.dockerfile,
        manifest: manifest.manifest,
        package: packageName,
        dockerfileVersion: dockerVersion,
        manifestVersion,
        status: 'INSTALL_DECLARATION_MISMATCH',
      });
    }
  }
}

const removalScripts = files
  .filter((file) => /\.(bat|cmd|ps1|sh|mjs|mts)$/i.test(file))
  .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }))
  .filter(({ text }) => /docker\s+(?:stop|rm|rmi)|pip\s+uninstall|apt(?:-get)?\s+(?:remove|purge)|conda\s+(?:remove|uninstall)/i.test(text))
  .map(({ file, text }) => ({
    file: rel(file),
    operationClass: classifyOperatorScript(rel(file)),
    matches: text.split(/\r?\n/).filter((line) => /docker\s+(?:stop|rm|rmi)|pip\s+uninstall|apt(?:-get)?\s+(?:remove|purge)|conda\s+(?:remove|uninstall)/i.test(line)).map((line) => line.trim()),
  }));

function classifyOperatorScript(file) {
  const normalized = file.toLowerCase();
  if (/(^|\/)(test|tests|evals?)(\/|[-_])|smoke|production-deployment/.test(normalized)) {
    return 'TEST_OR_EVAL_CLEANUP';
  }
  if (normalized.includes('build-trt-engine') || normalized.includes('start-triton')) {
    return 'ENGINE_BUILD_OR_RESTART_CLEANUP';
  }
  if (normalized.includes('start-infrastructure') || normalized.includes('setup-rabbitmq') || normalized.includes('start-gpu-wsl')) {
    return 'OPERATOR_LIFECYCLE_CLEANUP';
  }
  if (normalized.includes('prove-runtime-degradation')) return 'DIAGNOSTIC_ONLY';
  return 'REVIEW_REQUIRED';
}

const activeContainers = observeActiveContainers();
const pythonInterpreterOverrides = new Map(process.argv.filter((arg) => arg.startsWith('--python-interpreter=')).map((arg) => {
  const match = arg.slice('--python-interpreter='.length).match(/^([A-Za-z0-9_.-]+):(\/[^\s]+)$/);
  if (!match) throw new Error('INVALID_PYTHON_INTERPRETER_OVERRIDE: expected container:/absolute/path');
  if (!activeContainers.some((container) => container.name === match[1])) throw new Error(`PYTHON_INTERPRETER_CONTAINER_NOT_RUNNING:${match[1]}`);
  return [match[1], match[2]];
}));
const runtimePythonChecks = process.argv.includes('--runtime-python-check')
  ? activeContainers.map((container) => {
    const record = { container: container.name, imageId: container.imageId, status: 'INTERPRETER_NOT_DISCOVERED', probes: [], packages: [], pipCheck: null, writesPerformed: false };
    const override = pythonInterpreterOverrides.get(container.name);
    record.interpreterSelection = override ? 'EXPLICIT_APPLICATION_INTERPRETER' : 'DEFAULT_PATH_DISCOVERY_APPLICATION_BINDING_UNPROVEN';
    for (const executable of override ? [override] : ['python3', 'python']) {
      try {
        const payload = execFileSync('docker', ['exec', container.containerId, executable, '-c',
          'import sys,json,glob,importlib.metadata as m; records=[json.load(open(p)) for p in glob.glob(sys.prefix+"/conda-meta/*.json")]; print(json.dumps({"python":sys.version,"prefix":sys.prefix,"condaPackages":[{k:r.get(k) for k in ["name","version","build"]} for r in records],"packages":sorted([{"name":d.metadata.get("Name", "unknown"),"version":d.version} for d in m.distributions()],key=lambda d:d["name"])}))'],
        { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
        const inventory = JSON.parse(payload);
        Object.assign(record, inventory, { executable, status: 'PYTHON_INVENTORY_PROVEN' });
        record.requiredImportProbe = null;
        if (container.name === 'atlas-gpu-8098') {
          try {
            execFileSync('docker', ['exec', container.containerId, executable, '-c', 'import torch,cudf,cuvs,cugraph; assert torch.cuda.is_available()'], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
            record.requiredImportProbe = { status: 'PASSED', imports: ['torch', 'cudf', 'cuvs', 'cugraph'], cudaAvailable: true };
          } catch (error) {
            record.requiredImportProbe = { status: 'FAILED', imports: ['torch', 'cudf', 'cuvs', 'cugraph'], error: `${error.stderr ?? error.message}`.trim() };
            record.status = 'REQUIRED_GPU_IMPORT_PROBE_FAILED';
          }
        }
        try {
          const output = execFileSync('docker', ['exec', container.containerId, executable, '-m', 'pip', 'check'], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
          record.pipCheck = { exitCode: 0, output: output.trim(), status: 'PASSED' };
        } catch (error) {
          const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
          record.pipCheck = { exitCode: error.status ?? null, output, status: /No module named pip/.test(output) ? 'PIP_NOT_INSTALLED' : 'FAILED_OR_UNAVAILABLE' };
          record.status = 'DEPENDENCY_MANAGER_REVIEW_REQUIRED';
        }
        break;
      } catch (error) {
        record.probes.push({ executable, exitCode: error.status ?? null, error: `${error.stderr ?? error.message}`.trim() });
      }
    }
    return record;
  }) : [];

const metrics = {
  dockerfileCount: containers.length,
  externalBaseReferenceCount: containers.reduce((n, c) => n + c.baseImages.filter((b) => b.inheritedFromStage === null && b.externalBase !== null).length, 0),
  internalStageReferenceCount: containers.reduce((n, c) => n + c.baseImages.filter((b) => b.inheritedFromStage !== null).length, 0),
  digestPinnedBaseCount: containers.filter((c) => c.baseImages.length > 0 && c.baseImages.every((b) => b.pinStatus === 'DIGEST_PINNED')).length,
  floatingBaseCount: containers.filter((c) => c.baseImages.some((b) => b.pinStatus === 'FLOATING_TAG')).length,
  tagPinnedOnlyBaseCount: containers.reduce((n, c) => n + c.baseImages.filter((b) => b.inheritedFromStage === null && b.pinStatus === 'TAG_PINNED_ONLY').length, 0),
  buildArgSubstitutedBaseCount: containers.reduce((n, c) => n + c.baseImages.filter((b) => b.inheritedFromStage === null && b.pinStatus === 'BUILD_ARG_SUBSTITUTED').length, 0),
  pythonManifestCount: pythonManifests.length,
  exactManifestCount: pythonManifests.filter((m) => m.status === 'EXACT_DIRECT_REQUIREMENTS').length,
  structuredReviewManifestCount: pythonManifests.filter((m) => m.status === 'PYPROJECT_REQUIRES_STRUCTURED_REVIEW').length,
  looseManifestCount: pythonManifests.filter((m) => m.status === 'LOOSE_OR_RANGE_REQUIREMENTS').length,
  containerScopedManifestCount: pythonManifests.filter((m) => m.containerScoped).length,
  containerScopedLooseManifestCount: pythonManifests.filter((m) => m.containerScoped && m.status === 'LOOSE_OR_RANGE_REQUIREMENTS').length,
  removalScriptCount: removalScripts.length,
  testOrEvalCleanupScriptCount: removalScripts.filter((s) => s.operationClass === 'TEST_OR_EVAL_CLEANUP').length,
  operatorLifecycleCleanupScriptCount: removalScripts.filter((s) => s.operationClass === 'OPERATOR_LIFECYCLE_CLEANUP').length,
  engineBuildOrRestartCleanupScriptCount: removalScripts.filter((s) => s.operationClass === 'ENGINE_BUILD_OR_RESTART_CLEANUP').length,
  reviewRequiredCleanupScriptCount: removalScripts.filter((s) => s.operationClass === 'REVIEW_REQUIRED').length,
  dependencyContractMismatchCount: dependencyContractMismatches.length,
  composeFileCount: composeFiles.length,
  composeImageCount: composeImageRefs.length,
  composeDigestPinnedImageCount: composeImageRefs.filter((i) => i.pinStatus === 'DIGEST_PINNED').length,
  composeFloatingImageCount: composeImageRefs.filter((i) => i.pinStatus === 'FLOATING_TAG').length,
  composeTagPinnedOnlyImageCount: composeImageRefs.filter((i) => i.pinStatus === 'TAG_PINNED_ONLY').length,
  composeBuildArgImageCount: composeImageRefs.filter((i) => i.pinStatus === 'BUILD_ARG_SUBSTITUTED').length,
  currentComposeImageCount: currentComposeExternalRefs.length,
  currentComposeExternalImageCount: currentComposeExternalRefs.length,
  currentComposeDigestPinnedImageCount: currentComposeExternalRefs.filter((i) => i.pinStatus === 'DIGEST_PINNED').length,
  currentComposeFloatingImageCount: currentComposeExternalRefs.filter((i) => i.pinStatus === 'FLOATING_TAG').length,
  currentComposeTagPinnedOnlyImageCount: currentComposeExternalRefs.filter((i) => i.pinStatus === 'TAG_PINNED_ONLY').length,
  archivedComposeImageCount: archivedComposeRefs.length,
  buildBackedComposeImageCount: buildBackedComposeRefs.length,
  activeContainerCount: activeContainers.length,
  runtimePythonCheckedContainerCount: runtimePythonChecks.length,
  runtimePythonInventoryCount: runtimePythonChecks.filter((c) => c.executable).length,
  runtimePythonDependencyReviewCount: runtimePythonChecks.filter((c) => c.status === 'DEPENDENCY_MANAGER_REVIEW_REQUIRED').length,
  runtimeRequiredImportProbeFailureCount: runtimePythonChecks.filter((c) => c.requiredImportProbe?.status === 'FAILED').length,
  activeContainerRegistryDigestCount: activeContainers.filter((c) => c.repoDigests.length > 0).length,
  activeContainerImageInspectionFailureCount: activeContainers.filter((c) => c.imageInspectionError).length,
};

const report = {
  schema: 'DockerReproducibilityAuditV1',
  generatedAt: new Date().toISOString(),
  scope: 'repository Dockerfiles and Python dependency manifests',
  writesPerformed: false,
  derivedReportWritten: true,
  searchableDependencyManifestRules: [
    '!docker/**/requirements*.txt',
    '!services/**/requirements*.txt',
    '!scripts/**/requirements*.txt',
    '!python/requirements*.txt',
  ],
  migrationAuthorized: false,
  runtimeObservation: {
    dockerAvailable: activeContainers.length > 0,
    activeContainers,
    writesPerformed: false,
  },
  runtimePythonChecks,
  runtimePythonCheckPolicy: 'READ_ONLY_INSTALLED_METADATA_AND_PIP_CHECK; conda-owned libraries require separate manager reconciliation; no package installation or import execution',
  composeImageRefs,
  metrics,
  containers,
  pythonManifests,
  dependencyContractMismatches,
  removalScripts,
  blockers: [
    ...(metrics.runtimePythonDependencyReviewCount ? ['LIVE_PYTHON_DEPENDENCY_REVIEW_REQUIRED'] : []),
    ...(metrics.runtimeRequiredImportProbeFailureCount ? ['LIVE_REQUIRED_GPU_IMPORT_PROBE_FAILED'] : []),
    'CONTAINER_DEPENDENCY_BUILD_REACHABILITY_UNPROVEN',
    ...(metrics.activeContainerImageInspectionFailureCount ? ['RUNNING_CONTAINER_IMAGE_INSPECTION_FAILED'] : []),
    ...(metrics.floatingBaseCount ? ['FLOATING_BASE_IMAGES'] : []),
    ...(metrics.tagPinnedOnlyBaseCount ? ['TAG_ONLY_BASE_IMAGES'] : []),
    ...(metrics.buildArgSubstitutedBaseCount ? ['BUILD_ARG_BASE_IMAGES'] : []),
    ...(metrics.containerScopedLooseManifestCount ? ['LOOSE_CONTAINER_PYTHON_REQUIREMENTS'] : []),
    ...(metrics.dependencyContractMismatchCount ? ['DOCKER_MANIFEST_CONTRACT_MISMATCH'] : []),
    ...(metrics.currentComposeFloatingImageCount ? ['CURRENT_COMPOSE_FLOATING_EXTERNAL_IMAGES'] : []),
    ...(metrics.currentComposeTagPinnedOnlyImageCount ? ['CURRENT_COMPOSE_TAG_ONLY_EXTERNAL_IMAGES'] : []),
    ...(metrics.activeContainerCount > metrics.activeContainerRegistryDigestCount ? ['ACTIVE_IMAGE_REGISTRY_DIGEST_UNPROVEN'] : []),
    ...(metrics.removalScriptCount ? ['DESTRUCTIVE_OPERATOR_SCRIPTS_PRESENT'] : []),
  ],
};
report.checksum = sha256(JSON.stringify(report));

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const tmp = `${reportPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`);
fs.renameSync(tmp, reportPath);
console.log(JSON.stringify({
  status: report.blockers.length ? 'DOCKER_REPRODUCIBILITY_REVIEW_REQUIRED' : 'DOCKER_REPRODUCIBILITY_PROVEN',
  ...metrics,
  blockers: report.blockers,
  reportPath,
  checksum: report.checksum,
}, null, 2));
