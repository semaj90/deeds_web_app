# Packet Identity Scope-Mapping Proof — 2026-10-27

## Result

The operator selected `repo:root` mapped to repository UUID `01a13137-1378-7df9-9968-53738dbf0e48`, at `SOURCE_FILE` grain, with legacy keys retained as storage locators. The code-only resolver now also rejects a different repository UUID. This proves neither packet admission nor live registry resolution.

## Evidence

- Operator decision: `repo:root` scope, mapped to the `deeds-web-app` root repository UUID, `SOURCE_FILE` grain, with legacy keys retained as storage locators. This is a semantic decision only; it is not write authorization.
- PostgreSQL `READ ONLY` transaction, rolled back: UUID `01a13137-1378-7df9-9968-53738dbf0e48` resolves to `source_authority_repo_id=deeds-web-app`, `repository_kind=ROOT`.
- Fresh PostgreSQL `READ ONLY` lookup found both V2 registry relations absent, zero `atlas_packets` rows for `packet:230639e4-f984-5343-ac4d-aa1440219f54`, and zero matching legacy alias rows. Existing `atlas_packet_identity_aliases` has columns `alias_key`, `canonical_packet_key`, `alias_kind`, `producer_id`, `producer_revision`, and `created_at`; it is not the proposed v1 alias relation.
- Read-only catalog review confirms `atlas_packets.packet_key` has a unique constraint, so it can support the proposed V2 alias table's storage-key foreign key. The existing legacy alias table instead has a foreign key from `canonical_packet_key` directly to `atlas_packets.packet_key`; it cannot represent a canonical V2 key that is not itself stored in `atlas_packets`.
- Fresh live `graphify_executions` readback separates authority by revision: `01a1763a-4355-71d7-9b81-2c7a1814a41f` is `COMPLETED` for current `c63620c4…` but not canonical; the IDs in the old apply-resolution report (`74d50c86…`, `0dba1c0d…`) both belong to `e24bb971…`. Do not use the legacy report to promote the current execution.
- Replayed the existing pure `computePacketKeyV2` recipe for the admitted `domain-taxonomy.ts` source ref, selected `repo:root` scope, and `SOURCE_FILE` grain; it returns `packet:230639e4-f984-5343-ac4d-aa1440219f54`. This is a deterministic candidate only, not an admitted or persisted identity.
- `packet-identity-registry-v1.spec.ts`: the focused fixture suite passes 9/9, including wrong-root-UUID rejection, absent/mismatched authority rejection, and alias/storage-locator mismatch refusal.
- Alias integrity review found the registry draft did not require a legacy alias key to equal its physical `storage_packet_key`. The pure resolver, Drizzle schema, and unapplied SQL draft now enforce that invariant; the focused suite also rejects mismatched alias/storage keys.
- Focused resolver tests pass 9/9. `atlas-directory-first-analysis-v1` strict OpenSpec validation passes. Scoped `git diff --check` passes with the repository's existing LF/CRLF warnings.

## Scope and remaining gates

- The resolver change verifies the selected root mapping through `atlas_repository_identity`; it does not create registry rows or aliases.
- The two registry tables are needed for the selected V2 logical-identity/legacy-storage-locator split, but not for read-only source analysis or proposal generation. Creating them requires separate schema approval; populating them also requires a current, explicitly authorized execution owner and a bounded source/alias cohort.
- The SQL draft and Drizzle schema encode the selected root UUID and `repo:root` scope. The draft remains unapplied and requires schema-owner review and explicit operator approval.
- This schema refinement is not database validation or migration execution; the target v1 relations remain absent.
- The live registry lookup path, current-revision packet/chunk binding, retrieval, ACE `ContextManifest`, and prefill-cache readback remain unproven.
- The full `npm run check` attempt was stopped after Svelte diagnostics consumed more than 5 GB and continued growing. No full Svelte-check result is claimed.
- No packet, alias, schema, projection, cache, graph, or GPU writes were performed.

## Next proof

Review the unapplied DDL against the existing alias contract and verify the registry's scope-to-repository invariant. Then, only after explicit migration authorization, test one source-file identity with independent database readback before proceeding to chunk/retrieval/ACE lineage.
