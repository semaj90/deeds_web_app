/** Classify a requirements-file declaration; this does not resolve dependencies. */
export function classifyRequirementPin(line) {
  const value = line.trim().replace(/\s+#.*$/, '');
  if (!value || value.startsWith('#')) return 'IGNORED';
  if (/^(?:-r\s*|--requirement(?:=|\s)|-c\s*|--constraint(?:=|\s))/.test(value)) return 'INCLUDED_MANIFEST_REQUIRES_REVIEW';
  if (/^(?:--(?:extra-)?index-url|--find-links|--trusted-host|--hash|--require-hashes|--only-binary|--prefer-binary)(?:\s|=|$)/.test(value)) return 'INSTALL_OPTION';
  if (/git\+/.test(value)) return /@[a-f0-9]{40}(?:#|\s|$)/i.test(value) ? 'IMMUTABLE_VCS_COMMIT' : 'MUTABLE_VCS_REFERENCE';
  if (/\s@\s|https?:\/\//.test(value)) return /#sha256=[a-f0-9]{64}(?:\s|$)/i.test(value) ? 'HASHED_ARTIFACT' : 'UNHASHED_DIRECT_REFERENCE';
  if (/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[^\]]+\])?\s*==\s*[^\s;,*<>=!~]+(?:\s*;.*)?(?:\s*\\)?$/.test(value)) return 'EXACT_VERSION';
  return 'UNPINNED_OR_UNRESOLVED';
}
