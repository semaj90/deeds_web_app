import crypto from 'node:crypto';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.mts', 'typescript'], ['.cts', 'typescript'],
  ['.js', 'javascript'], ['.jsx', 'javascript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
  ['.py', 'python'], ['.go', 'go'], ['.rs', 'rust'], ['.c', 'cpp'], ['.cc', 'cpp'],
  ['.cpp', 'cpp'], ['.h', 'cpp'], ['.hh', 'cpp'], ['.hpp', 'cpp'], ['.cu', 'cpp'],
]);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const isTestPath = (value) => /(^|\/)(__tests__|tests?)(\/|$)|\.(?:spec|test)\.[^.]+$/i.test(value);

function packageModuleNames(packageName, ecosystem) {
  if (ecosystem === 'python') {
    const known = { beautifulsoup4: ['bs4'], pyyaml: ['yaml'], 'scikit-learn': ['sklearn'], pillow: ['PIL'] };
    return known[packageName.toLowerCase()] ?? [packageName.replaceAll('-', '_').toLowerCase()];
  }
  if (ecosystem === 'rust') return [packageName.replaceAll('-', '_')];
  return [packageName];
}

function extractImportedModules(text, ecosystem) {
  const modules = new Set();
  if (ecosystem === 'typescript' || ecosystem === 'javascript') {
    const expression = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const match of text.matchAll(expression)) {
      const parts = match[1].split('/');
      modules.add(parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
    }
  } else if (ecosystem === 'python') {
    for (const match of text.matchAll(/\b(?:from|import)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g)) modules.add(match[1].split('.')[0]);
  } else if (ecosystem === 'go') {
    for (const match of text.matchAll(/["`]([^"`]+)["`]/g)) modules.add(match[1]);
  } else if (ecosystem === 'rust') {
    for (const match of text.matchAll(/\b(?:use|extern\s+crate)\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/g)) modules.add(match[1].split('::')[0]);
  } else if (ecosystem === 'cpp') {
    for (const match of text.matchAll(/^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm)) modules.add(match[1].split('/')[0]);
  }
  return modules;
}

const packageKey = (value) => String(value).toLowerCase().replaceAll('_', '-').replaceAll('.', '-');

export function normalizeDocumentationUrlV1(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return null;
  }
}

function declarationEvidence(inventory, packageName) {
  const npm = (inventory.npm?.packages.find((item) => item.name === packageName)?.declarations ?? [])
    .map((item) => ({
      manifest: item.manifest,
      ecosystem: 'npm',
      section: item.section,
      declaredRange: item.declaredRange,
      declaredVersion: null,
      lockedVersions: item.lockResolvedVersions ?? [],
      installed: item.installed ?? false,
      installedVersion: item.installedVersion ?? null,
      versionSource: item.lockStatus ?? 'NPM_MANIFEST',
    }));
  const other = (inventory.nonNpm ?? []).filter((item) => packageKey(item.name) === packageKey(packageName))
    .map((item) => ({
      manifest: item.manifest,
      ecosystem: item.ecosystem,
      section: null,
      declaredRange: item.declaredRange,
      declaredVersion: item.declaredVersion ?? null,
      lockedVersions: item.lockedVersions ?? [],
      installed: false,
      installedVersion: null,
      versionSource: item.versionSource,
    }));
  return [...npm, ...other].sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.manifest.localeCompare(b.manifest));
}

export function buildDocumentationDemandV1({ catalog, inventory, sourceFiles, indexedDocuments = [], inputFiles = [] }) {
  const snapshotByPath = new Map();
  for (const file of [...sourceFiles, ...inputFiles]) {
    const normalizedPath = file.path.replaceAll('\\', '/');
    snapshotByPath.set(normalizedPath, { path: normalizedPath, sha256: file.sha256 ?? sha256(file.text) });
  }
  const snapshotRows = [...snapshotByPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  const usageByPackage = new Map();
  const packageByModule = new Map();
  const addModule = (ecosystem, moduleName, packageName) => {
    const key = `${ecosystem}\0${moduleName}`;
    const names = packageByModule.get(key) ?? new Set();
    names.add(packageName);
    packageByModule.set(key, names);
  };
  for (const source of catalog.sources ?? []) {
    for (const packageName of source.packages ?? []) {
      for (const ecosystem of source.ecosystems ?? []) {
        if (ecosystem === 'npm' || ecosystem === 'typescript' || ecosystem === 'javascript') {
          addModule('typescript', packageName, packageName);
          addModule('javascript', packageName, packageName);
        } else {
          for (const moduleName of packageModuleNames(packageName, ecosystem)) addModule(ecosystem, moduleName, packageName);
        }
      }
    }
  }
  for (const file of sourceFiles) {
    const filePath = file.path.replaceAll('\\', '/');
    const languages = file.language ? [file.language] : [SOURCE_EXTENSIONS.get(path.extname(filePath).toLowerCase())].filter(Boolean);
    for (const ecosystem of languages) {
      for (const moduleName of extractImportedModules(file.text, ecosystem)) {
        for (const packageName of packageByModule.get(`${ecosystem}\0${moduleName}`) ?? []) {
        const entry = usageByPackage.get(packageName) ?? new Map();
        entry.set(filePath, { path: filePath, test: isTestPath(filePath) });
        usageByPackage.set(packageName, entry);
        }
      }
    }
  }

  const maxUsage = Math.max(1, ...(catalog.sources ?? []).map((source) => (source.packages ?? [])
    .reduce((count, name) => count + (usageByPackage.get(name)?.size ?? 0), 0)));
  const demands = (catalog.sources ?? []).map((source) => {
    const packages = (source.packages ?? []).map((packageName) => {
      const files = [...(usageByPackage.get(packageName)?.values() ?? [])].sort((a, b) => a.path.localeCompare(b.path));
      const declarations = declarationEvidence(inventory, packageName);
      const lockedVersions = [...new Set(declarations.flatMap((item) => item.lockedVersions))].sort();
      return {
        package: packageName,
        declarations,
        sourceUse: {
          distinctFiles: files.length,
          nonTestFiles: files.filter((file) => !file.test).length,
          testFiles: files.filter((file) => file.test).length,
          evidenceFiles: files.slice(0, 40).map((file) => file.path),
          evidenceTruncated: files.length > 40,
          lexicalImportScan: true,
        },
        lockedVersions,
        declaredVersions: [...new Set(declarations.map((item) => item.declaredVersion).filter(Boolean))].sort(),
      };
    });
    const declarationCount = packages.reduce((count, item) => count + item.declarations.length, 0);
    const usageCount = packages.reduce((count, item) => count + item.sourceUse.distinctFiles, 0);
    const importance = ({ P0: 1, P1: 0.65, P2: 0.35 })[source.priority] ?? 0.2;
    const usage = Math.min(1, usageCount / maxUsage);
    const dependencyEvidence = declarationCount > 0 ? 1 : 0;
    const versionEvidence = packages.some((item) => item.lockedVersions.length > 0) ? 1 : 0;
    const declaredVersionEvidence = packages.some((item) => item.declaredVersions.length > 0) ? 1 : 0;
    const indexed = indexedDocumentCoverage(source, indexedDocuments);
    const documentationGap = indexed.requestedUrlCount === 0
      ? 0
      : (indexed.requestedUrlCount - indexed.indexedUrlCount) / indexed.requestedUrlCount;
    const relevanceScore = Number((0.36 * usage + 0.22 * importance + 0.18 * dependencyEvidence + 0.14 * versionEvidence + 0.06 * declaredVersionEvidence + 0.04 * documentationGap).toFixed(6));
    return {
      sourceId: source.id,
      sourceKind: 'official_docs',
      priority: source.priority ?? 'UNRANKED',
      relevanceScore,
      scoreStatus: 'DETERMINISTIC_HEURISTIC_UNCALIBRATED',
      ecosystems: [...(source.ecosystems ?? [])].sort(),
      apiSurfaces: source.apiSurfaces ?? [],
      officialUrls: source.urls ?? [],
      qualification: source.qualification ?? null,
      packages,
      indexedDocumentation: indexed,
      fetchStatus: indexed.requestedUrlCount === 0
        ? 'NO_CATALOG_URLS'
        : indexed.missingUrls.length === 0
          ? 'ALREADY_INDEXED'
          : 'PLANNED_MISSING_URLS',
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore || a.sourceId.localeCompare(b.sourceId));

  const sourceSnapshotChecksum = sha256(Buffer.from(JSON.stringify(snapshotRows), 'utf8'));
  const demandChecksum = sha256(Buffer.from(JSON.stringify(demands), 'utf8'));
  return {
    schema: 'atlas.documentation-demand.v1',
    status: 'READ_ONLY_DETERMINISTIC_FETCH_PLAN',
    canonicalAuthority: false,
    rankingWeights: { sourceUse: 0.36, catalogPriority: 0.22, dependencyDeclaration: 0.18, lockVersionEvidence: 0.14, exactDeclaredVersion: 0.06, indexedDocumentationGap: 0.04 },
    rankingCalibration: 'NOT_CALIBRATED; reviewer labels required before production ranking',
    sourceSnapshot: { fileCount: snapshotRows.length, checksum: sourceSnapshotChecksum },
    catalogRevision: catalog.catalogRevision ?? null,
    catalogChecksum: sha256(Buffer.from(JSON.stringify(catalog), 'utf8')),
    demandCount: demands.length,
    demandChecksum,
    demands,
    fetchPerformed: false,
    datastoreWritesPerformed: false,
  };
}

export function collectDocumentationSourceFiles(root, fs, options = {}) {
  const skipDirs = new Set(['.git', '.next', '.svelte-kit', '.turbo', '.tmp', 'tmp', 'node_modules', 'dist', 'build', 'coverage', 'target', 'vendor', 'deeds_labs', '.venv', 'venv', '.conda', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.idea', '.vscode']);
  const excludedRootDirs = (options.excludedRootDirs ?? []).map((value) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''));
  const isExcludedDirectory = (name) => skipDirs.has(name)
    || /^\.?(?:venv|virtualenv)(?:[-_.].*)?$/i.test(name)
    || /^\.?(?:python|py)(?:[-_.]?\d+)(?:[-_.].*)?$/i.test(name)
    || /^(?:gsd_archives|archive|archives|backups?)$/i.test(name)
    || /^backup(?:s|[-_].*)$/i.test(name)
    || /-backups?$/i.test(name)
    || /^(?:site-packages|dist-packages)$/i.test(name);
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const files = [];
  let skippedLargeFiles = 0;
  const visit = (directory) => {
    const relativeDirectory = path.relative(root, directory).replaceAll('\\', '/');
    if (excludedRootDirs.some((excluded) => relativeDirectory === excluded || relativeDirectory.startsWith(`${excluded}/`))) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isExcludedDirectory(entry.name)) visit(absolute);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(absolute);
        if (stat.size > maxBytes) { skippedLargeFiles += 1; continue; }
        const bytes = fs.readFileSync(absolute);
        files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), text: bytes.toString('utf8'), sha256: sha256(bytes) });
      }
    }
  };
  visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skippedLargeFiles };
}

export function collectNonNpmManifestFiles(root, fs, options = {}) {
  const skipDirs = new Set(['.git', 'node_modules', '.tmp', 'tmp', '.venv', 'venv', '.conda', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', 'target', 'vendor', 'deeds_labs']);
  const excludedRootDirs = (options.excludedRootDirs ?? []).map((value) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''));
  const isExcludedDirectory = (name) => skipDirs.has(name)
    || /^\.?(?:venv|virtualenv)(?:[-_.].*)?$/i.test(name)
    || /^\.?(?:python|py)(?:[-_.]?\d+)(?:[-_.].*)?$/i.test(name)
    || /^(?:gsd_archives|archive|archives|backups?)$/i.test(name)
    || /^backup(?:s|[-_].*)$/i.test(name)
    || /-backups?$/i.test(name)
    || /^(?:site-packages|dist-packages)$/i.test(name);
  const wanted = (name) => name === 'pyproject.toml' || name === 'go.mod' || name === 'Cargo.toml' || name === 'Cargo.lock'
    || /^requirements[^/]*\.txt$/i.test(name);
  const files = [];
  const visit = (directory) => {
    const relativeDirectory = path.relative(root, directory).replaceAll('\\', '/');
    if (excludedRootDirs.some((excluded) => relativeDirectory === excluded || relativeDirectory.startsWith(`${excluded}/`))) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isExcludedDirectory(entry.name)) visit(absolute);
      } else if (entry.isFile() && wanted(entry.name)) {
        const bytes = fs.readFileSync(absolute);
        files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), text: bytes.toString('utf8'), sha256: sha256(bytes) });
      }
    }
  };
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function collectIndexedDocumentationRecords(root, fs) {
  const directory = path.join(root, 'docs', '.okf', 'dev');
  const records = [];
  let invalidJsonCount = 0;
  const visit = (current) => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        let record;
        try { record = JSON.parse(fs.readFileSync(absolute, 'utf8')); } catch { invalidJsonCount += 1; continue; }
        if (record?.schema_version !== 'okf.dev.corpus.v1' || typeof record.source_id !== 'string' || typeof record.url !== 'string') continue;
        let parsedUrl;
        try { parsedUrl = new URL(record.url); } catch { continue; }
        records.push({
          sourceId: record.source_id,
          url: record.url,
          host: parsedUrl.host.toLowerCase(),
          contentHash: typeof record.content_hash === 'string' ? record.content_hash : null,
          path: path.relative(root, absolute).replaceAll('\\', '/'),
          fileSha256: sha256(fs.readFileSync(absolute)),
          kind: record.metadata?.kind ?? null,
        });
      }
    }
  };
  visit(directory);
  records.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.url.localeCompare(b.url) || a.path.localeCompare(b.path));
  return { records, invalidJsonCount };
}

function indexedDocumentCoverage(source, records) {
  const requestedUrls = [...new Set((source.urls ?? []).flatMap((value) => {
    const normalized = normalizeDocumentationUrlV1(value);
    return normalized ? [normalized] : [];
  }))].sort();
  const requestedUrlSet = new Set(requestedUrls);
  const matched = records.filter((record) => {
    return requestedUrlSet.has(normalizeDocumentationUrlV1(record.url));
  });
  const unique = [...new Map(matched.map((record) => [`${record.url}\0${record.contentHash ?? ''}`, record])).values()];
  const indexedUrls = new Set(unique.map((record) => {
    return normalizeDocumentationUrlV1(record.url);
  }));
  return {
    documentCount: unique.length,
    requestedUrlCount: requestedUrls.length,
    indexedUrlCount: indexedUrls.size,
    missingUrls: requestedUrls.filter((url) => !indexedUrls.has(url)),
    coverageRatio: requestedUrls.length === 0 ? null : Number((indexedUrls.size / requestedUrls.length).toFixed(6)),
    evidence: unique.slice(0, 20).map(({ sourceId, url, contentHash, path: filePath }) => ({ sourceId, url, contentHash, path: filePath })),
    evidenceTruncated: unique.length > 20,
    matchBasis: unique.length ? 'EXACT_CATALOG_URL' : 'NO_EXACT_CATALOG_URL_RECORD',
    corpusRecordsAreNonCanonicalDocumentation: true,
  };
}

export function parseNonNpmDependencyManifests(files) {
  const declarations = [];
  const cargoLocked = new Map();
  for (const file of files.filter((item) => path.basename(item.path) === 'Cargo.lock')) {
    const blocks = file.text.split(/^\[\[package\]\]\s*$/m).slice(1);
    for (const block of blocks) {
      const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      if (!name || !version) continue;
      const rows = cargoLocked.get(packageKey(name)) ?? new Set();
      rows.add(version);
      cargoLocked.set(packageKey(name), rows);
    }
  }

  const cargoWorkspaceVersions = new Map();
  const cargoFiles = files.filter((item) => path.basename(item.path) === 'Cargo.toml');
  for (const file of cargoFiles) {
    let section = '';
    for (const line of file.text.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)\]/);
      if (header) { section = header[1]; continue; }
      if (section !== 'workspace.dependencies') continue;
      const declaration = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
      if (!declaration) continue;
      const version = declaration[2].match(/^(?:"([^"]+)"|.*?\bversion\s*=\s*"([^"]+)".*)$/)?.slice(1).find(Boolean) ?? null;
      if (version) cargoWorkspaceVersions.set(packageKey(declaration[1]), version);
    }
  }
  for (const file of cargoFiles) {
    let section = '';
    for (const line of file.text.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)\]/);
      if (header) { section = header[1]; continue; }
      if (!/^(?:dev-|build-)?dependencies(?:\.[\w-]+)?$/.test(section)) continue;
      const declaration = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*(?:#.*)?$/);
      if (!declaration) continue;
      const version = declaration[2].match(/^(?:"([^"]+)"|.*?\bversion\s*=\s*"([^"]+)".*)$/)?.slice(1).find(Boolean) ?? null;
      const workspaceReference = /\bworkspace\s*=\s*true\b/.test(declaration[2]);
      const declaredVersion = version ?? (workspaceReference ? cargoWorkspaceVersions.get(packageKey(declaration[1])) ?? null : null);
      declarations.push({
        name: declaration[1], ecosystem: 'rust', manifest: file.path,
        declaredVersion, declaredRange: declaredVersion, lockedVersions: [...(cargoLocked.get(packageKey(declaration[1])) ?? [])].sort(),
        versionSource: 'CARGO_TOML_AND_CARGO_LOCK',
      });
    }
  }

  for (const file of files) {
    const basename = path.basename(file.path);
    if (/^requirements[^/]*\.txt$/i.test(basename)) {
      for (const line of file.text.split(/\r?\n/)) {
        const value = line.split('#', 1)[0].trim();
        const match = value.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/);
        if (!match || value.startsWith('-') || value.includes('://')) continue;
        declarations.push({ name: match[1], ecosystem: 'python', manifest: file.path, declaredRange: match[2].trim() || null,
          declaredVersion: /^==\s*[^,;]+$/.test(match[2].trim()) ? match[2].trim().slice(2).trim() : null,
          lockedVersions: [], versionSource: 'REQUIREMENTS_DECLARATION_NOT_LOCK' });
      }
    } else if (basename === 'pyproject.toml') {
      const projectSection = file.text.match(/(?:^|\n)\s*\[project\]([^]*?)(?=\n\s*\[|$)/)?.[1] ?? '';
      const optionalSection = [...file.text.matchAll(/(?:^|\n)\s*\[project\.optional-dependencies\.[^\]]+\]([^]*?)(?=\n\s*\[|$)/g)].map((match) => match[1]).join('\n');
      const dependencySections = [...`${projectSection}\n${optionalSection}`.matchAll(/(?:^|\n)\s*dependencies\s*=\s*\[([\s\S]*?)\]/g)];
      for (const section of dependencySections) {
        for (const match of section[1].matchAll(/["']([^"']+)["']/g)) {
          const spec = match[1].match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/);
          if (!spec) continue;
          declarations.push({ name: spec[1], ecosystem: 'python', manifest: file.path, declaredRange: spec[2].trim() || null,
            declaredVersion: /^==\s*[^,;]+$/.test(spec[2].trim()) ? spec[2].trim().slice(2).trim() : null,
            lockedVersions: [], versionSource: 'PYPROJECT_DECLARATION_NOT_LOCK' });
        }
      }
    } else if (basename === 'go.mod') {
      let inRequireBlock = false;
      for (const line of file.text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (/^require\s*\($/.test(trimmed)) { inRequireBlock = true; continue; }
        if (inRequireBlock && trimmed === ')') { inRequireBlock = false; continue; }
        const match = trimmed.match(/^(?:require\s+)?([^\s]+)\s+(v\S+)(?:\s*\/\/\s*(indirect))?/);
        if (!match || (!inRequireBlock && !trimmed.startsWith('require '))) continue;
        declarations.push({ name: match[1], ecosystem: 'go', manifest: file.path, declaredRange: match[2], declaredVersion: match[2],
          lockedVersions: [], indirect: match[3] === 'indirect', versionSource: 'GO_MOD_SELECTED_VERSION' });
      }
    }
  }
  return declarations.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name) || a.manifest.localeCompare(b.manifest));
}
