const JS_SPECIFIER = /(?:from\s*|import\s*\(|require\s*\(|import\s*)['"]([^'"]+)['"]/g;
const PY_FROM = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+/gm;
const PY_IMPORT = /^\s*import\s+([A-Za-z_][\w.]*(?:\s+as\s+\w+)?(?:\s*,\s*[A-Za-z_][\w.]*(?:\s+as\s+\w+)?)*)/gm;
const PY_DYNAMIC = /(?:import_module|__import__)\(\s*['"]([A-Za-z_][\w.]*)['"]/g;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function npmNameFor(specifier, packageNames) {
  if (specifier.startsWith('.') || specifier.startsWith('$') || specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const candidate = parts[0].startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : parts[0];
  return packageNames.has(candidate) ? candidate : null;
}

function normalizePythonName(value) {
  return value.toLowerCase().replaceAll('_', '-').replaceAll('.', '-');
}

function pythonNamesFor(moduleName, packageNames, normalizedNames, moduleToDistributions) {
  const topLevel = moduleName.split('.')[0];
  const mapped = moduleToDistributions.get(topLevel);
  if (mapped?.length) return mapped.filter(name => packageNames.has(name));
  const fallback = normalizedNames.get(normalizePythonName(topLevel));
  return fallback ? [fallback] : [];
}

function buildByteOffsets(source) {
  const offsets = new Uint32Array(source.length + 1);
  let byteOffset = 0;
  for (let index = 0; index < source.length; index += 1) {
    offsets[index] = byteOffset;
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
      const next = source.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        offsets[index + 1] = byteOffset;
        byteOffset += 4;
        index += 1;
        offsets[index + 1] = byteOffset;
        continue;
      }
    }
    byteOffset += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    offsets[index + 1] = byteOffset;
  }
  offsets[source.length] = byteOffset;
  return offsets;
}

function buildLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) if (source.charCodeAt(index) === 10) starts.push(index + 1);
  return starts;
}

function lineAt(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (lineStarts[middle] <= offset) low = middle;
    else high = middle;
  }
  return low + 1;
}

function addReference(references, source, byteOffsets, lineStarts, start, specifier, ecosystem, packageName) {
  const end = start + specifier.length;
  references.push({
    ecosystem,
    packageName,
    specifier,
    line1: lineAt(lineStarts, start),
    startUtf16: start,
    endUtf16: end,
    startByte: byteOffsets[start],
    endByte: byteOffsets[end],
  });
}

function addPythonMatches(source, regex, moduleToNames, references, byteOffsets, lineStarts) {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const moduleNames = moduleToNames(match[1]);
    for (const packageName of moduleNames) {
      const start = match.index + match[0].indexOf(match[1]);
      addReference(references, source, byteOffsets, lineStarts, start, match[1], 'pypi', packageName);
    }
    if (match[0].length === 0) regex.lastIndex += 1;
  }
}

export function extractPackageReferencesV1({ source, relativePath, npmPackageNames, pythonPackageNames, moduleToDistributions }) {
  if (typeof source !== 'string' || typeof relativePath !== 'string') throw new TypeError('PACKAGE_REFERENCE_SOURCE_INVALID');
  const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase();
  const references = [];
  const byteOffsets = buildByteOffsets(source);
  const lineStarts = buildLineStarts(source);

  if (extension === '.py') {
    const distributions = pythonPackageNames instanceof Map
      ? new Set(pythonPackageNames.values()) : new Set(pythonPackageNames);
    const normalizedNames = new Map([...distributions].map(name => [normalizePythonName(name), name]));
    const moduleResolver = moduleName => pythonNamesFor(moduleName, distributions, normalizedNames, moduleToDistributions);
    addPythonMatches(source, PY_FROM, moduleResolver, references, byteOffsets, lineStarts);
    PY_IMPORT.lastIndex = 0;
    let match;
    while ((match = PY_IMPORT.exec(source)) !== null) {
      let cursor = match.index + match[0].indexOf(match[1]);
      for (const segment of match[1].split(',')) {
        const moduleName = segment.trim().split(/\s+as\s+/)[0];
        const relativeStart = match[0].indexOf(moduleName, cursor - match.index);
        const start = match.index + (relativeStart >= 0 ? relativeStart : match[0].indexOf(moduleName));
        for (const packageName of moduleResolver(moduleName)) {
          addReference(references, source, byteOffsets, lineStarts, start, moduleName, 'pypi', packageName);
        }
        cursor = match.index + Math.max(relativeStart, 0) + moduleName.length;
      }
      if (match[0].length === 0) PY_IMPORT.lastIndex += 1;
    }
    addPythonMatches(source, PY_DYNAMIC, moduleResolver, references, byteOffsets, lineStarts);
  } else {
    JS_SPECIFIER.lastIndex = 0;
    let match;
    while ((match = JS_SPECIFIER.exec(source)) !== null) {
      const packageName = npmNameFor(match[1], npmPackageNames);
      if (packageName) {
        const start = match.index + match[0].indexOf(match[1]);
        addReference(references, source, byteOffsets, lineStarts, start, match[1], 'npm', packageName);
      }
      if (match[0].length === 0) JS_SPECIFIER.lastIndex += 1;
    }
  }

  references.sort((left, right) => left.startUtf16 - right.startUtf16
    || compareText(left.ecosystem, right.ecosystem)
    || compareText(left.packageName, right.packageName));
  const packageSet = [...new Set(references.map(reference => `${reference.ecosystem}:${reference.packageName}`))].sort(compareText);
  return { references, packageSet };
}

export function comparePackageSurfaceRowV1(surfaceRow, extractedPackageSet) {
  const expected = (surfaceRow.packages ?? []).map(item => `${item.ecosystem}:${item.name}`).sort(compareText);
  const actual = [...extractedPackageSet].sort(compareText);
  const same = expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  return {
    same,
    expected,
    actual,
    missing: expected.filter(value => !actual.includes(value)),
    unexpected: actual.filter(value => !expected.includes(value)),
  };
}

export const PACKAGE_REFERENCE_CANDIDATE_V1_SCHEMA = 'atlas.package-reference-candidate.v1';
