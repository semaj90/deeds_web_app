import { resolveGraphifyScopeRepositoryMappingV1 } from './packet-key-v2-admission-v1.mjs';

export function classifyGraphifyMembershipScopeV1({ membershipRows, repositoryScope, scopeMapPresent, scopeMappings }) {
  if (!Array.isArray(membershipRows) || membershipRows.length !== 1) {
    return { ok: false, code: 'MEMBERSHIP_NOT_UNIQUE', repositoryId: null };
  }
  if (membershipRows[0]?.membership_repository_scope !== repositoryScope) {
    return { ok: false, code: 'MEMBERSHIP_SCOPE_MISMATCH', repositoryId: null };
  }
  if (!scopeMapPresent) return { ok: false, code: 'SCOPE_MAPPING_DDL_NOT_APPLIED', repositoryId: null };
  const mapping = resolveGraphifyScopeRepositoryMappingV1(repositoryScope, scopeMappings);
  if (!mapping.ok) return { ok: false, code: mapping.code, repositoryId: null };
  return { ok: true, code: null, repositoryId: mapping.repositoryId };
}
