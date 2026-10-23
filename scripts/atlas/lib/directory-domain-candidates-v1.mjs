import { createHash } from 'node:crypto';

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const tokenPattern = /[a-z0-9]+/g;
const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'into', 'including', 'specifically', 'where', 'their', 'that', 'this', 'code', 'layer', 'layers', 'system', 'systems', 'task', 'tasks', 'strategy', 'strategies', 'communication', 'management', 'application', 'automated']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function tokens(value) {
  return [...new Set((String(value).toLowerCase().match(tokenPattern) ?? []))];
}

function parsePackageNames(value) {
  let rows;
  try {
    rows = JSON.parse(value ?? '[]');
  } catch {
    throw new TypeError('DIRECTORY_PACKAGE_CANDIDATES_INVALID');
  }
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.packageName !== 'string' || !row.packageName.trim())) {
    throw new TypeError('DIRECTORY_PACKAGE_CANDIDATES_INVALID');
  }
  return rows.map(row => row.packageName.trim());
}

function normalizeGroup(group) {
  const id = group.group_id ?? group.groupId;
  const label = group.group_label ?? group.groupLabel;
  const parentGroupId = group.parent_group_id ?? group.parentGroupId ?? null;
  const description = group.description ?? '';
  if (typeof id !== 'string' || !id || typeof label !== 'string' || !label || typeof description !== 'string'
    || (parentGroupId !== null && typeof parentGroupId !== 'string')) {
    throw new TypeError('DOMAIN_GROUP_INVALID');
  }
  const idTokens = tokens(id);
  const labelTokens = tokens(label);
  const descriptionTokens = tokens(description).filter(token => token.length >= 4 && !stopWords.has(token));
  return { id, label, parentGroupId, terms: new Set([...idTokens, ...labelTokens, ...descriptionTokens]) };
}

export function buildDirectoryDomainCandidatesV1({ directories, groups, vocabularySha256 }) {
  if (!Array.isArray(directories) || !Array.isArray(groups) || typeof vocabularySha256 !== 'string'
    || !/^[a-f0-9]{64}$/i.test(vocabularySha256)) throw new TypeError('DOMAIN_CANDIDATE_INPUT_INVALID');
  const normalizedGroups = groups.map(normalizeGroup).sort((a, b) => compareText(a.id, b.id));
  const groupById = new Map(normalizedGroups.map(group => [group.id, group]));
  if (groupById.size !== normalizedGroups.length) throw new TypeError('DOMAIN_GROUP_ID_DUPLICATE');
  for (const group of normalizedGroups) {
    if (group.parentGroupId !== null && !groupById.has(group.parentGroupId)) throw new TypeError('DOMAIN_PARENT_NOT_FOUND');
  }

  const seenDirectories = new Set();
  const rows = [];
  for (const directory of directories) {
    const relativePath = directory.relativePath;
    if (typeof relativePath !== 'string' || !relativePath || seenDirectories.has(relativePath)
      || !/^[a-f0-9]{64}$/i.test(directory.summarySha256 ?? '') || !/^[a-f0-9]{64}$/i.test(directory.inputDigest ?? '')) {
      throw new TypeError('DIRECTORY_SUMMARY_IDENTITY_INVALID');
    }
    seenDirectories.add(relativePath);
    const pathTokens = new Set(tokens(relativePath));
    const packageNames = parsePackageNames(directory.topDirectPackageCandidatesJson);
    const packageTokens = new Set(packageNames.flatMap(tokens));
    const candidates = [];
    for (const group of normalizedGroups) {
      const pathMatches = [...group.terms].filter(term => pathTokens.has(term)).sort(compareText);
      const packageMatches = [...group.terms].filter(term => packageTokens.has(term)).sort(compareText);
      if (pathMatches.length === 0 && packageMatches.length === 0) continue;
      const score = pathMatches.length * 3 + packageMatches.length * 2;
      candidates.push({ group, pathMatches, packageMatches, score, candidateKind: 'DIRECT_MATCH' });
    }
    const directMatches = candidates.slice();
    for (const candidate of directMatches) {
      const parent = candidate.group.parentGroupId ? groupById.get(candidate.group.parentGroupId) : null;
      if (!parent || candidates.some(existing => existing.group.id === parent.id)) continue;
      candidates.push({ group: parent, pathMatches: [], packageMatches: [], score: candidate.score,
        candidateKind: 'INHERITED_PARENT_CANDIDATE', inheritedFromGroupId: candidate.group.id });
    }
    candidates.sort((a, b) => b.score - a.score || compareText(a.group.id, b.group.id));
    if (candidates.length === 0) {
      rows.push({ relativePath, summarySha256: directory.summarySha256, inputDigest: directory.inputDigest,
        candidateGroupId: null, parentGroupId: null, inheritedFromGroupId: null, candidateKind: 'NO_MATCH', matchedPathTerms: [], matchedPackageTerms: [],
        score: 0, status: 'UNCLASSIFIED_NO_DOMAIN_SIGNAL' });
      continue;
    }
    for (const candidate of candidates) {
      rows.push({ relativePath, summarySha256: directory.summarySha256, inputDigest: directory.inputDigest,
        candidateGroupId: candidate.group.id, parentGroupId: candidate.group.parentGroupId,
        inheritedFromGroupId: candidate.inheritedFromGroupId ?? null,
        candidateKind: candidate.candidateKind, matchedPathTerms: candidate.pathMatches,
        matchedPackageTerms: candidate.packageMatches, score: candidate.score, status: 'PROPOSAL_ONLY' });
    }
  }
  rows.sort((a, b) => compareText(a.relativePath, b.relativePath)
    || b.score - a.score || compareText(a.candidateGroupId ?? '', b.candidateGroupId ?? ''));
  const counts = { directories: seenDirectories.size, directCandidates: 0, inheritedCandidates: 0, unclassified: 0 };
  for (const row of rows) {
    if (row.candidateKind === 'DIRECT_MATCH') counts.directCandidates++;
    else if (row.candidateKind === 'INHERITED_PARENT_CANDIDATE') counts.inheritedCandidates++;
    else counts.unclassified++;
  }
  return { schema: 'atlas.directory-domain-candidates.v1', vocabularySha256: vocabularySha256.toLowerCase(),
    canonicalAuthority: false, status: 'ADVISORY_PROPOSALS_ONLY', rows, counts, rowsSha256: sha256(JSON.stringify(rows)) };
}
