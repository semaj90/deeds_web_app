# Semantic Atlas Live Authorization Catalog Audit

Date: 2026-10-24

## Scope and method

Read-only audit of the live PostgreSQL information-schema catalog, application authorization code, VerifiedContext wiring, and FunctionRegistry source-binding reader. Catalog queries returned table and column names only; no row content was queried. No database, cache, or source-data writes were performed.

## Findings

- No non-system-schema table matched the exact known-column combination of principal identity (`actor_id`, `user_id`, `principal_id`, `grantee_id`, `subject_id`, or `created_by`), workspace/repository identity, and permitted-source/permission scope.
- The broader catalog scan surfaced `authorization_audit_log`, `atlas_workspace_source_bindings`, `workspaces`, and graph/source membership tables. Their roles are distinct:
  - `authorization_audit_log` records user, tool, action, permission, role, and request metadata. Its owner inserts audit events and queries prior events; it is not a grant resolver.
  - `atlas_workspace_source_bindings` records `repo_id`, `workspace_revision`, `canonical_source_ref`, `source_revision`, `content_digest`, byte length, optional manifest/Git facts, producer revision, checksum, and observation time. It has no actor/user identity, workspace ID, grant revision, or permitted-source scope.
  - `workspaces` has creator/case metadata, not repository/source grants.
  - Graph membership records describe captured membership, not principal authorization.
- `tool-authorization.ts` derives global tool capabilities from the authenticated user's role; it does not resolve workspace/repository grants.
- `hooks.server.ts` registers `verifiedContextRuntimeV1`. That runtime checks the independent workspace-revision authority, then refuses with `VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED` because its eight downstream providers—including authorized source scope, source byte/span reading, feature-snapshot admission, and ContextManifest admission—are absent.
- The FunctionRegistry PostgreSQL loader reads source bindings and exact revisions, but a source search found no application caller. Its focused loader/read-adapter suites pass 17/17; this is contract evidence, not live production composition.

## Query correction and limits

The first broad regex search falsely matched `extractor_version` because “extractor” contains the substring “actor.” The query was corrected to exact identity/scope column names and repeated across non-system schemas; the strict combined scan returned no candidate table. The catalog check cannot rule out a grant system using entirely different column names or an external identity service, and the source search did not locate such an owner.

The existing schema-inspector utility was not run because it writes a fixed report path. The generic table-count utility was not run because it uses a hard-coded fallback database URL and scans every table.

## Validation

- VerifiedContext runtime/service specs: 16/16 passed.
- FunctionRegistry PostgreSQL loader/read-adapter specs: 17/17 passed.
- Live catalog probes: successful read-only SELECTs; no source/data rows returned.
- No authorization provider was wired, and no grant or evidence was fabricated.

## Gate

Production semantic admission remains blocked until an authoritative owner supplies actor-to-workspace/repository grants and allowed source references, and the remaining VerifiedContext providers are composed. Do not derive authorization from worktree leases, `workspaces.created_by`, case ownership, audit logs, source bindings, or graph membership. Keep grounded ontology tuples proposal-only until source authority, canonical identity, taxonomy review, and evidence admission pass.
